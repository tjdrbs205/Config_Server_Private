import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import path from "path";

import { fs } from "memfs";
import { EnvironmentValue } from "../config.class";

export class GitRepository {
  private environment: EnvironmentValue;

  private REPO_DIR = "/repo";
  private GIT_AUTH_TOKEN: string;
  private GIT_URL: string;
  private GIT_REF: string;

  constructor() {
    fs.mkdirSync(this.REPO_DIR, { recursive: true });
    this.environment = EnvironmentValue.getInstance();
    this.GIT_AUTH_TOKEN = this.environment.GIT_AUTH_TOKEN;
    this.GIT_URL = this.environment.GIT_URL;
    this.GIT_REF = this.environment.GIT_BRANCH;
  }

  async cloneRepo() {
    await git.clone({
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
    });
    console.log(
      `✅ [${this.constructor.name}] Cloned repository to ${this.REPO_DIR}`
    );
  }

  async updateRepo() {
    await git.pull({
      fs,
      http,
      dir: this.REPO_DIR,
      url: this.GIT_URL,
      ref: this.GIT_REF,
      singleBranch: true,
      onAuth: () => ({
        username: this.GIT_AUTH_TOKEN,
      }),
    });
    console.log(
      `✅ [${this.constructor.name}] Updated repository to ${this.REPO_DIR}`
    );
  }

  async listAllFiles(dir: string) {
    const results: string[] = [];
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (
        typeof ent === "object" &&
        "name" in ent &&
        typeof ent.name === "string"
      ) {
        const fullPath = path.posix.join(dir, ent.name);

        if (ent.isDirectory()) {
          const subFiles = await this.listAllFiles(fullPath);
          results.push(...subFiles);
        } else if (ent.isFile()) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  async getConfigFilelist() {
    const allFilesList = await this.listAllFiles(this.REPO_DIR);
    const configFiles = allFilesList.filter((filePath) =>
      [".yml", ".yaml", ".json"].some((ext) => filePath.endsWith(ext))
    );
    return configFiles;
  }

  async findFilesByName(fileName: string) {
    const root = this.REPO_DIR;
    const outputs: Record<string, string> = {};
    try {
      const allFiles = await this.listAllFiles(root);
      for (const filePath of allFiles) {
        if (path.basename(filePath) === fileName) {
          try {
            const content = await fs.promises.readFile(filePath);
            outputs[filePath] = content.toString("utf-8");
          } catch (err) {
            console.error(
              `❌ [${this.constructor.name}] Error reading file ${filePath}:`,
              err
            );
            continue;
          }
        }
      }
    } catch (err) {
      console.error(`❌ [${this.constructor.name}] Error finding files:`, err);
    }
    return outputs;
  }

  async getDirectory(dir: string) {
    let results: string[] = [];
    dir = "/" + dir;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      let name: string;

      if (
        typeof entry === "object" &&
        "name" in entry &&
        typeof entry.name === "string"
      ) {
        name = entry.name;
      } else if (Buffer.isBuffer(entry)) {
        name = entry.toString("utf-8");
      } else {
        name = entry as string;
      }

      const fullPath = path.join(dir, name);

      if (
        typeof entry === "object" &&
        "isDirectory" in entry &&
        entry.isDirectory()
      ) {
        results = results.concat(await this.getDirectory(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }
}
