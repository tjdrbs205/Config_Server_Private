import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import path from "path";
import { fs as memfs } from "memfs";
import fs from "fs";
import dotenv from "dotenv";
import YAML from "yaml";
import PropertiesReader from "properties-reader";

import { EnvironmentValue, ModeEnv } from "./environmentValue";
import { splitFilePath } from "./utils/configParser";

function checkFileSystemMode(mode: string): any {
  console.log("Git Repository Mode:", mode);
  if (mode === ModeEnv.LOCAL) return fs;
  else if (mode === ModeEnv.INMEMORY) return memfs;
  else throw new Error("Invalid Git Repository Mode");
}

export class GitRepository {
  private environment: EnvironmentValue;
  private fs: any;

  private pollInterval: NodeJS.Timeout | null = null;

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
    await git.fetch({
      fs: this.fs,
      http,
      dir: this.environment.GIT_REPO_DIR,
      url: this.environment.GIT_URL,
      ref: this.environment.GIT_BRANCH,
      singleBranch: true,
      onAuth: () => ({
        username: this.environment.GIT_AUTH_TOKEN,
      }),
    });

    await git.checkout({
      fs: this.fs,
      dir: this.environment.GIT_REPO_DIR,
      ref: `origin/${this.environment.GIT_BRANCH}`,
      force: true,
    });
    console.log(`✅ [${this.constructor.name}] Updated repository to ${this.environment.GIT_REPO_DIR}`);
  }

  private async getRemoteHead(): Promise<string> {
    const remoteRefs = await git.listServerRefs({
      http,
      url: this.environment.GIT_URL,
      prefix: `refs/heads/${this.environment.GIT_BRANCH}`,
      onAuth: () => ({
        username: this.environment.GIT_AUTH_TOKEN,
      }),
    });
    return remoteRefs[0].oid ?? "";
  }

  private async getCommitHash(ref: string): Promise<string | null> {
    try {
      return await git.resolveRef({
        fs: this.fs,
        dir: this.environment.GIT_REPO_DIR,
        ref,
      });
    } catch {
      return null;
    }
  }

  private async getLocalHead(): Promise<string> {
    return (await this.getCommitHash("HEAD")) ?? "";
  }

  async getCurrentCommitHash(): Promise<string | null> {
    return this.getCommitHash("HEAD");
  }

  private async checkUpdates(): Promise<boolean> {
    const local = await this.getLocalHead();
    const remote = await this.getRemoteHead();

    if (local !== remote) {
      console.log(`🔄 [${this.constructor.name}] Detected updates in remote repository.`);
      await this.updateRepo();
      await this.initFileIndex();
      return true;
    }
    console.log(`✅ [${this.constructor.name}] No updates detected.`);
    return false;
  }

  startPolling(intervalMs: number = 60000) {
    if (this.pollInterval) {
      console.log(`⚠️ [${this.constructor.name}] Polling already started`);
      return;
    }

    console.log(`⏱️ [${this.constructor.name}] Starting polling every ${intervalMs / 1000}s`);
    this.pollInterval = setInterval(async () => {
      try {
        await this.checkUpdates();
      } catch (error) {
        console.error(`❌ [${this.constructor.name}] Error during polling:`, error);
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log(`🛑 [${this.constructor.name}] Stopped polling`);
    }
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
   * Search file paths by application and profiles
   *
   * @param application
   * @param profiles - Single profile or multiple comma-separated profiles
   * @returns string[]
   */
  private async getFilePathsByApplicationAndProfiles(application: string, profiles: string[]) {
    const get = (p: string, a: string): string[] => GitRepository.#fileIndex.get(p)?.get(a) ?? [];

    // Generate ordered list based on priority
    // Priority: application.yml < application-{profile}.yml < {app}.yml < {app}-{profile}.yml
    // Later profiles in the list have higher priority
    const ordered: string[] = [];

    // 1. application default config
    ordered.push(...get("default", "application"));

    // 2. application-{profile} config (in order of profiles)
    for (const profile of profiles) {
      ordered.push(...get(profile, "application"));
    }

    // 3. {app} default config
    ordered.push(...get("default", application));

    // 4. {app}-{profile} config (in order of profiles)
    for (const profile of profiles) {
      ordered.push(...get(profile, application));
    }

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
      const { name, profile } = splitFilePath(fileName);

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
    this.startPolling(this.environment.GIT_POLL_INTERVAL);
    GitRepository.#isReady = true;
  }

  /**
   * Find and merge configuration files based on application and profiles
   *
   * @param application
   * @param profiles - Single profile string or comma-separated profiles (e.g., "dev,local")
   */
  async find(application: string, profiles: string): Promise<Array<{ name: string; source: Record<string, any> }>> {
    if (!GitRepository.#isReady) throw new Error("Repository is not ready yet.");

    // Convert comma-separated profiles to array
    const profileList = profiles
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Use default if profiles is empty
    const currentProfiles = profileList.length > 0 ? profileList : ["default"];

    const filePaths = await this.getFilePathsByApplicationAndProfiles(application, currentProfiles);
    const propertySources: Array<{ name: string; source: Record<string, unknown> }> = [];

    for (let i = filePaths.length - 1; i >= 0; i--) {
      const filePath = filePaths[i];
      const content = await this.fs.promises.readFile(filePath, "utf-8");
      if (typeof content !== "string") continue;
      const parsed = await this.parseConfig(filePath, content);
      const fileName = path.posix.basename(filePath);

      propertySources.push({ name: fileName, source: parsed });
    }

    return propertySources;
  }
}
