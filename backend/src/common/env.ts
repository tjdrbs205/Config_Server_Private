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
  GIT_AUTH_TOKEN: string = process.env.GIT_AUTH_TOKEN || "";
  GIT_URL: string = process.env.GIT_URL || "";
  GIT_BRANCH: string = process.env.GIT_BRANCH || "main";

  NODE_ENV: string = this.isNodeEnv(String(process.env.NODE_ENV))
    ? (process.env.NODE_ENV as NodeEnv)
    : NodeEnv.DEV;
  MODE_ENV: string = this.isModeEnv(String(process.env.MODE_ENV))
    ? (process.env.MODE_ENV as ModeEnv)
    : ModeEnv.INMEMORY;

  private isNodeEnv(env: string): env is NodeEnv {
    return Object.values(NodeEnv).includes(env as NodeEnv);
  }

  private isModeEnv(env: string): env is ModeEnv {
    return Object.values(ModeEnv).includes(env as ModeEnv);
  }
}
