import dotenv from "dotenv";

dotenv.config();

export enum NodeEnv {
  DEV = "development",
  PROD = "production",
  TEST = "test",
}
export enum ModeEnv {
  INMEMORY = "inmemory",
  LOCAL = "local",
}

export class EnvironmentValue {
  private static instance: EnvironmentValue | null = null;
  static getInstance(): EnvironmentValue {
    if (!EnvironmentValue.instance) {
      EnvironmentValue.instance = new EnvironmentValue();
    }
    return EnvironmentValue.instance;
  }

  PORT: number = Number(process.env.PORT) || 8000;
  GIT_REPO_DIR: string = process.env.GIT_REPO_DIR || "./repo";
  GIT_AUTH_TOKEN: string = process.env.GIT_AUTH_TOKEN || "";
  GIT_URL: string = process.env.GIT_URL || "";
  GIT_BRANCH: string = process.env.GIT_BRANCH || "main";

  SERVER_MODE: string = this.isNodeEnv(String(process.env.SERVER_MODE))
    ? (process.env.SERVER_MODE as NodeEnv)
    : NodeEnv.DEV;
  GIT_REPO_MODE: string = this.isModeEnv(String(process.env.GITREPO_MODE))
    ? (process.env.GITREPO_MODE as ModeEnv)
    : ModeEnv.INMEMORY;

  PHASE_API_KEY: string = process.env.PHASE_API_KEY || "";
  PHASE_APP_ID: string = process.env.PHASE_APP_ID || "";
  PHASE_ENV_NAME: string = process.env.PHASE_ENV_NAME || "";

  API_KEY: string = process.env.API_KEY || "";

  private isNodeEnv(env: string): env is NodeEnv {
    return Object.values(NodeEnv).includes(env as NodeEnv);
  }

  private isModeEnv(env: string): env is ModeEnv {
    return Object.values(ModeEnv).includes(env as ModeEnv);
  }
}
