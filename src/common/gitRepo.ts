import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import path from "path";
import { fs as memfs } from "memfs";
import fs from "fs";
import dotenv from "dotenv";
import YAML from "yaml";
import PropertiesReader from "properties-reader";

import { EnvironmentValue, ModeEnv } from "./environmentValue";

function checkFileSystemMode(mode: string): any {
  console.log("Git Repository Mode:", mode);
  if (mode === ModeEnv.LOCAL) return fs;
  else if (mode === ModeEnv.INMEMORY) return memfs;
  else throw new Error("Invalid Git Repository Mode");
}

export class GitRepository {
  private environment: EnvironmentValue;
  private fs: any;

  static #fileIndex: Map<string, Map<string, string[]>> = new Map();
  static #applicationsIndex: Map<string, string[]> = new Map();
  static #ProfileIndex: Map<string, string[]> = new Map();
  static #isReady: boolean = false;

  constructor(mode: string) {
    this.environment = EnvironmentValue.getInstance();
    this.fs = checkFileSystemMode(mode);
    this.fs.mkdirSync(this.environment.GIT_REPO_DIR, { recursive: true });
  }

  private async cloneRepo() {
    await git
      .clone({
        fs: this.fs,
        http,
        dir: this.environment.GIT_REPO_DIR,
        url: this.environment.GIT_URL,
        ref: this.environment.GIT_BRANCH,
        singleBranch: true,
        depth: 1,
        onAuth: () => ({
          username: this.environment.GIT_AUTH_TOKEN,
        }),
      })
      .catch((error) => {
        throw {
          status: 500,
          message: "Failed to clone Git repository",
          error: error.message,
        };
      });
    console.log(`✅ [${this.constructor.name}] Cloned repository to ${this.environment.GIT_REPO_DIR}`);
  }

  private async updateRepo() {
    await git
      .pull({
        fs: this.fs,
        http,
        dir: this.environment.GIT_REPO_DIR,
        url: this.environment.GIT_URL,
        ref: this.environment.GIT_BRANCH,
        singleBranch: true,
        onAuth: () => ({
          username: this.environment.GIT_AUTH_TOKEN,
        }),
      })
      .catch((error) => {
        throw {
          status: 500,
          message: "Failed to update Git repository",
          error: error.message,
        };
      });
    console.log(`✅ [${this.constructor.name}] Updated repository to ${this.environment.GIT_REPO_DIR}`);
  }

  /**
   * Recursively list all files in a directory
   * @param dir - The directory to list files from
   *
   *  @example return [
   * '/repo/application-dev.yml',
   * '/repo/application-prod.yml',
   * '/repo/service-a-default.json',
   * '/repo/service-a-dev.json',
   * ]
   */
  private async listAllFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const allDir: string[] = [dir];

    while (allDir.length > 0) {
      const currentDir = allDir.pop();
      if (!currentDir) continue;

      const entries = await this.fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (typeof entry === "object" && "name" in entry && typeof entry.name === "string") {
          const fullPath = path.posix.join(currentDir, entry.name);
          if (entry.name === ".git") continue;
          if (entry.isDirectory()) allDir.push(fullPath);
          else if (entry.isFile()) results.push(fullPath);
        }
      }
    }
    return results;
  }

  /**
   * @param filePath - The file path to split
   * @return {
   *  name,
   *  profile,
   *  ext
   * }
   */
  private splitFilePath(filePath: string) {
    const lastDot = filePath.lastIndexOf(".");
    const ext = lastDot >= 0 ? filePath.slice(lastDot) : "";
    const stem = lastDot >= 0 ? filePath.slice(0, lastDot) : filePath;

    const lastDash = stem.lastIndexOf("-");
    const name = lastDash >= 0 ? stem.slice(0, lastDash) : stem;
    const profile = lastDash >= 0 ? stem.slice(lastDash + 1) : "default";

    return { name, profile, ext };
  }

  /**
   * @param target
   * @param source
   *
   * @example
   * return {
   * key1: 'value1',
   *  key2: {
   *   subKey1: 'subValue1',
   *   subKey2: 'subValue2',
   *  },
   * key3: 'value3',
   * }
   */
  private mergeConfigs(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const isPlainObject = (v: unknown): v is Record<string, unknown> => {
      return typeof v === "object" && v !== null && !Array.isArray(v);
    };
    const queue: Array<{ t: Record<string, unknown>; s: Record<string, unknown> }> = [{ t: target, s: source }];

    while (queue.length > 0) {
      const { t, s } = queue.shift()!;
      for (const key of Object.keys(s)) {
        const sv = s[key];
        const tv = t[key];

        if (isPlainObject(sv) && isPlainObject(tv)) {
          queue.push({ t: tv, s: sv });
        } else {
          t[key] = sv;
        }
      }
    }
    return target;
  }

  /**
   * search file paths by application
   *
   * @param application
   * @return string[]
   */
  private async getFilePathsByApplication(application: string) {
    const get = (a: string): string[] => GitRepository.#applicationsIndex.get(a) ?? [];
    return [...get(application)];
  }

  /**
   * search file paths by profile
   *
   * @param profile
   * @returns string[]
   */
  private async getFilePathsByProfile(profile: string) {
    const get = (p: string): string[] => GitRepository.#ProfileIndex.get(p) ?? [];
    return [...get(profile)];
  }

  /**
   * search file paths by application and profile
   *
   * @param application
   * @param profile
   * @returns string[]
   */
  private async getFilePathsByApplicationAndProfile(application: string, profile: string) {
    const get = (p: string, a: string): string[] => GitRepository.#fileIndex.get(p)?.get(a) ?? [];
    // Generate ordered list based on priority
    const ordered = [
      ...get("default", "application"),
      ...get(profile, "application"),
      ...get("default", application),
      ...get(profile, application),
    ];
    const seen = new Set<string>();
    const depuped: string[] = [];
    for (const filePath of ordered) {
      if (!seen.has(filePath)) {
        seen.add(filePath);
        depuped.push(filePath);
      }
    }
    return depuped;
  }

  /**
   * Parse configuration file based on its extension
   *
   * @param filename
   * @param content
   * @returns Record<string, any>
   */
  private async parseConfig(filename: string, content: string): Promise<Record<string, any>> {
    try {
      if (filename.endsWith(".json")) return await JSON.parse(content);
      if (filename.endsWith(".env")) return dotenv.parse(content);
      if (filename.endsWith(".yml") || filename.endsWith(".yaml")) return await YAML.parse(content);
      if (filename.endsWith(".properties")) {
        return PropertiesReader(content).getAllProperties();
      }
      throw new Error(`Unsupported file format: ${filename}`);
    } catch (error) {
      console.error(`Error parsing file ${filename}:`, error);
      return { error: `Failed to parse ${filename}` };
    }
  }

  /**
   * Get configuration files based on application and/or profile
   *
   * @param options
   * @returns Array<{ name: string; source: Record<string, any> }>
   */
  private async getConfigFiles(options: { application?: string; profile?: string }) {
    let filePaths: string[];
    if (options.application && options.profile) {
      filePaths = await this.getFilePathsByApplicationAndProfile(options.application, options.profile);
    } else if (options.application) {
      filePaths = await this.getFilePathsByApplication(options.application);
    } else if (options.profile) {
      filePaths = await this.getFilePathsByProfile(options.profile);
    } else {
      throw new Error("At least one of application or profile must be provided.");
    }

    const fileContents = [];
    for (const filePath of filePaths) {
      const content = await this.fs.promises.readFile(filePath, "utf-8");
      if (typeof content !== "string") continue;
      const parsed = await this.parseConfig(filePath, content);
      fileContents.push({ name: filePath, source: parsed });
    }
    return fileContents;
  }

  /**
   * Sort file paths by directory depth and remove duplicates
   *
   * @param arr
   * @returns string[]
   */
  private sortPaths = (arr: string[]) => {
    const seen = new Set<string>();
    arr.sort((a: string, b: string) => {
      const da = a.split("/").length;
      const db = b.split("/").length;
      if (da === db) return da - db;
      return a.localeCompare(b);
    });
    return arr.filter((p) => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });
  };

  /**
   * Initialize file index for quick lookups
   */
  private async initFileIndex() {
    GitRepository.#fileIndex.clear();
    GitRepository.#applicationsIndex.clear();
    GitRepository.#ProfileIndex.clear();

    const allFiles = await this.listAllFiles(this.environment.GIT_REPO_DIR);
    const configFiles = allFiles.filter((filePath) =>
      [".yml", ".yaml", ".json", ".env"].some((ext) => filePath.endsWith(ext))
    );

    for (const filePath of configFiles) {
      const fileName = path.posix.basename(filePath);
      const { name, profile, ext } = this.splitFilePath(fileName);

      // --- profile -> app -> [paths]
      if (!GitRepository.#fileIndex.has(profile)) GitRepository.#fileIndex.set(profile, new Map());
      const profileMap = GitRepository.#fileIndex.get(profile)!;
      if (!profileMap.has(name)) profileMap.set(name, []);
      profileMap.get(name)!.push(filePath);

      // --- app -> [paths]
      if (!GitRepository.#applicationsIndex.has(name)) GitRepository.#applicationsIndex.set(name, []);
      GitRepository.#applicationsIndex.get(name)!.push(filePath);

      // --- profile -> set(app)
      if (!GitRepository.#ProfileIndex.has(profile)) GitRepository.#ProfileIndex.set(profile, []);
      GitRepository.#ProfileIndex.get(profile)!.push(filePath);
    }
    for (const [, pmap] of GitRepository.#fileIndex) {
      for (const [app, arr] of pmap) pmap.set(app, this.sortPaths(arr));
    }
    console.log(`✅ [${this.constructor.name}] File index initialized.`);
  }

  /**
   * Start the Git repository service
   */
  async start() {
    GitRepository.#isReady = false;
    const gitDir = path.posix.join(this.environment.GIT_REPO_DIR, ".git");
    const exists = await this.fs.promises
      .stat(gitDir)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await this.cloneRepo();
    } else {
      await this.updateRepo();
    }
    await this.initFileIndex();
    GitRepository.#isReady = true;
  }

  /**
   * Find and merge configuration files based on application and profile
   *
   * @param application
   * @param profile
   * @returns Record<string, unknown>
   */
  async find(application: string, profile: string): Promise<Record<string, unknown>> {
    if (!GitRepository.#isReady) throw new Error("Repository is not ready yet.");
    const source = await this.getConfigFiles({ application, profile });
    let merged: Record<string, unknown> = {};
    for (const file of source) {
      if (typeof file.source === "object" && file.source !== null) {
        merged = this.mergeConfigs(merged, file.source);
      }
    }
    return merged;
  }
}
