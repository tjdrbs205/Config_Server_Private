import dotenv from "dotenv";

dotenv.config();

enum NodeEnv {
  DEV = "development",
  PROD = "production",
  TEST = "test",
}
enum ModeEnv {
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
  GIT_REPO_DIR: string = process.env.GIT_REPO_DIR || "/repo";
  GIT_AUTH_TOKEN: string = process.env.GIT_AUTH_TOKEN || "";
  GIT_URL: string = process.env.GIT_URL || "";
  GIT_BRANCH: string = process.env.GIT_BRANCH || "main";

  SERVER_MODE: string = this.isNodeEnv(String(process.env.NODE_ENV)) ? (process.env.NODE_ENV as NodeEnv) : NodeEnv.DEV;
  GITREPO_MODE: string = this.isModeEnv(String(process.env.MODE_ENV))
    ? (process.env.MODE_ENV as ModeEnv)
    : ModeEnv.INMEMORY;

  PHASE_API_KEY: string = process.env.PHASE_API_KEY || "";

  private isNodeEnv(env: string): env is NodeEnv {
    return Object.values(NodeEnv).includes(env as NodeEnv);
  }

  private isModeEnv(env: string): env is ModeEnv {
    return Object.values(ModeEnv).includes(env as ModeEnv);
  }
}
