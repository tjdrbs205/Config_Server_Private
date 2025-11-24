import { EnvironmentValue } from "./EnvironmentValue";
import { fs as memfs } from "memfs";
import fs from "fs";

export type GitMode = "inmemory" | "local";

interface FileSystem {
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

function checkFileSystemMode(mode: GitMode) {
  if (mode === "local") return fs;
  else return memfs;
}

export class GitRepository {
  private environment: EnvironmentValue;
  private fs: FileSystem;

  constructor(mode: GitMode) {
    this.environment = EnvironmentValue.getInstance();
    this.fs = checkFileSystemMode(mode);
    this.fs.mkdirSync(this.environment.GIT_REPO_DIR, { recursive: true });
  }
}
