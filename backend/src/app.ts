import express, { Application } from "express";
import basicAuth from "express-basic-auth";
import cors from "cors";

import { errorHandler } from "./common/middleware/error.middleware";

import { EnvironmentValue } from "./common/EnvironmentValue";
import configRouter from "../src/config/config.router";
import { InMemory } from "./common/InMemory";

class ConfigServer {
  private app: Application = express();
  private environmentValue: EnvironmentValue;
  private gitRepositoryService: InMemory;
  constructor() {
    this.environmentValue = EnvironmentValue.getInstance();
    this.gitRepositoryService = InMemory.getInstance();
  }

  async init() {
    await this.gitRepositoryService.start().catch(console.error);
    this.preMiddleware();
  }

  preMiddleware() {
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(
      basicAuth({
        users: {
          [process.env.ADMIN_USER || "admin"]: process.env.ADMIN_PASS || "password",
        },
        challenge: true,
      })
    );
    this.router();
    this.app.use(errorHandler);
  }

  async router() {
    this.app.use("/config", configRouter);
  }

  async start() {
    await this.init();
    const port = this.environmentValue.PORT;
    this.app.listen(port, () => {
      console.log(`Config Server is running on port ${port}`);
    });
  }
}

const server = new ConfigServer();
server.start();
