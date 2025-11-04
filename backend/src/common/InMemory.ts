import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import path from "path";
import { fs } from "memfs";

import dotenv from "dotenv";
import YAML from "yaml";
import PropertiesReader from "properties-reader";

import { EnvironmentValue } from "./env";

export class InMemory {
  private static instance: InMemory | null = null;

  private environment: EnvironmentValue;

  private REPO_DIR = "/repo";
  private GIT_AUTH_TOKEN: string;
  private GIT_URL: string;
  private GIT_REF: string;

  static #fileIndex: Map<string, Map<string, string[]>> = new Map();
  static #applicationsIndex: Map<string, string[]> = new Map();
  static #ProfileIndex: Map<string, string[]> = new Map();
  static #isReady: boolean = false;

  private constructor() {
    fs.mkdirSync(this.REPO_DIR, { recursive: true });
    this.environment = EnvironmentValue.getInstance();
    this.GIT_AUTH_TOKEN = this.environment.GIT_AUTH_TOKEN;
    this.GIT_URL = this.environment.GIT_URL;
    this.GIT_REF = this.environment.GIT_BRANCH;
  }

  static getInstance(): InMemory {
    if (!InMemory.instance) {
      InMemory.instance = new InMemory();
    }
    return InMemory.instance;
  }

  private async cloneRepo() {
    await git
      .clone({
        fs,
        http,
        dir: this.REPO_DIR,
        url: this.GIT_URL,
        ref: this.GIT_REF,
        singleBranch: true,
        depth: 1,
        onAuth: () => ({
          username: this.GIT_AUTH_TOKEN,
        }),
      })
      .catch((error) => {
        throw {
          status: 500,
          message: "Failed to clone Git repository",
          error: error.message,
        };
      });
    console.log(`✅ [${this.constructor.name}] Cloned repository to ${this.REPO_DIR}`);
  }

  private async updateRepo() {
    await git
      .pull({
        fs,
        http,
        dir: this.REPO_DIR,
        url: this.GIT_URL,
        ref: this.GIT_REF,
        singleBranch: true,
        onAuth: () => ({
          username: this.GIT_AUTH_TOKEN,
        }),
      })
      .catch((error) => {
        throw {
          status: 500,
          message: "Failed to update Git repository",
          error: error.message,
        };
      });
    console.log(`✅ [${this.constructor.name}] Updated repository to ${this.REPO_DIR}`);
  }

  private async listAllFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const allDir: string[] = [dir];

    while (allDir.length > 0) {
      const currentDir = allDir.pop();
      if (!currentDir) continue;

      const entries = await fs.promises.readdir(currentDir, {
        withFileTypes: true,
      });

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

  private splitFilePath(filePath: string) {
    const lastDot = filePath.lastIndexOf(".");
    const ext = lastDot >= 0 ? filePath.slice(lastDot) : "";
    const stem = lastDot >= 0 ? filePath.slice(0, lastDot) : filePath;

    const lastDash = stem.lastIndexOf("-");
    const name = lastDash >= 0 ? stem.slice(0, lastDash) : stem;
    const profile = lastDash >= 0 ? stem.slice(lastDash + 1) : "default";

    return { name, profile, ext };
  }

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

  private async getFilePathsByApplication(application: string) {
    const get = (a: string): string[] => InMemory.#applicationsIndex.get(a) ?? [];
    return [...get(application)];
  }
  private async getFilePathsByProfile(profile: string) {
    const get = (p: string): string[] => InMemory.#ProfileIndex.get(p) ?? [];
    return [...get(profile)];
  }
  private async getFilePathsByApplicationAndProfile(application: string, profile: string) {
    const get = (p: string, a: string): string[] => InMemory.#fileIndex.get(p)?.get(a) ?? [];
    const ordered = [
      ...get(profile, application),
      ...get("default", application),
      ...get(profile, "application"),
      ...get("default", "application"),
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
      const content = await fs.promises.readFile(filePath, "utf-8");
      if (typeof content !== "string") continue;
      const parsed = await this.parseConfig(filePath, content);
      fileContents.push({ name: filePath, source: parsed });
    }
    return fileContents;
  }

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

  private async initFileIndex() {
    InMemory.#fileIndex.clear();
    InMemory.#applicationsIndex.clear();
    InMemory.#ProfileIndex.clear();

    const allFiles = await this.listAllFiles(this.REPO_DIR);
    const configFiles = allFiles.filter((filePath) =>
      [".yml", ".yaml", ".json", ".env"].some((ext) => filePath.endsWith(ext))
    );

    for (const filePath of configFiles) {
      const fileName = path.posix.basename(filePath);
      const { name, profile, ext } = this.splitFilePath(fileName);

      // --- profile -> app -> [paths]
      if (!InMemory.#fileIndex.has(profile)) InMemory.#fileIndex.set(profile, new Map());
      const profileMap = InMemory.#fileIndex.get(profile)!;
      if (!profileMap.has(name)) profileMap.set(name, []);
      profileMap.get(name)!.push(filePath);

      // --- app -> [paths]
      if (!InMemory.#applicationsIndex.has(name)) InMemory.#applicationsIndex.set(name, []);
      InMemory.#applicationsIndex.get(name)!.push(filePath);

      // --- profile -> set(app)
      if (!InMemory.#ProfileIndex.has(profile)) InMemory.#ProfileIndex.set(profile, []);
      InMemory.#ProfileIndex.get(profile)!.push(filePath);
    }
    for (const [, pmap] of InMemory.#fileIndex) {
      for (const [app, arr] of pmap) pmap.set(app, this.sortPaths(arr));
    }
    console.log(`✅ [${this.constructor.name}] File index initialized.`);
  }

  //

  async start() {
    InMemory.#isReady = false;
    const gitDir = path.posix.join(this.REPO_DIR, ".git");
    const exists = await fs.promises
      .stat(gitDir)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await this.cloneRepo();
    } else {
      await this.updateRepo();
    }
    await this.initFileIndex();
    InMemory.#isReady = true;
  }

  async list(): Promise<any>;
  async list(application: string, profile: string): Promise<any>;
  async list(param1?: string, param2?: string): Promise<Object> {
    if (InMemory.#isReady) throw new Error("Repository is not ready yet.");
    return {};
  }

  async find(application: string, profile: string): Promise<Object> {
    if (!InMemory.#isReady) throw new Error("Repository is not ready yet.");
    const source = await this.getConfigFiles({ application, profile });
    let merged: Record<string, unknown> = {};
    for (const file of source) {
      if (typeof file.source === "object" && file.source !== null) {
        merged = this.mergeConfigs(merged, file.source);
      }
    }
    return merged;
  }

  async getTest(s: boolean): Promise<string> {
    if (s) {
      throw new Error("Test error triggered.");
    }
    return "Test successful.";
  }

  //
}
