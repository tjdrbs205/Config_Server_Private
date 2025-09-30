import express, { Application } from "express";
import basicAuth from "express-basic-auth";
import cors from "cors";

import { GitRepository } from "../src/module/common/repository/repo";
import { EnvironmentValue } from "../src/module/common/config.class";

import ConfigRouter from "./module/config/github.config/config.router";

class ConfigServer {
  private app: Application = express();
  private environmentValue: EnvironmentValue;
  private gitRepository: GitRepository;
  constructor() {
    this.environmentValue = EnvironmentValue.getInstance();
    this.gitRepository = new GitRepository();
    this.init();
    this.preMiddleware();
    this.router();
  }

  async init() {
    await this.gitRepository.cloneRepo().catch(console.error);
  }

  async preMiddleware() {
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(
      basicAuth({
        users: {
          [process.env.ADMIN_USER || "admin"]:
            process.env.ADMIN_PASS || "password",
        },
        challenge: true,
      })
    );
  }

  async router() {
    this.app.use("/config", ConfigRouter);

    this.app.get("/test/:path", async (req, res) => {
      const result = await this.gitRepository.getConfigFilelist();
      res.send(result);
    });
  }

  async start() {
    const port = this.environmentValue.PORT;
    this.app.listen(port, () => {
      console.log(`Config server is running on port ${port}`);
    });
  }
}

const server = new ConfigServer();
server.start();
