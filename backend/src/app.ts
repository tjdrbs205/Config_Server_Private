import express, { Application } from "express";
import basicAuth from "express-basic-auth";
import cors from "cors";

import { errorHandler } from "./common/middleware/error.middleware";

import { EnvironmentValue } from "./common/env";
import configRouter from "../src/config/config.router";
import { InMemory } from "./common/InMemory";

class ConfigServer {
  private app: Application = express();
  private environmentValue: EnvironmentValue;
  private gitRepositoryService: InMemory;
  constructor() {
    this.environmentValue = EnvironmentValue.getInstance();
    this.gitRepositoryService = InMemory.getInstance();
    this.init();
    this.preMiddleware();
  }

  async init() {
    await this.gitRepositoryService.start().catch(console.error);
  }

  async preMiddleware() {
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
    const port = this.environmentValue.PORT;
    this.app.listen(port, () => {
      console.log(`Config server is running on port ${port}`);
    });
  }
}

const server = new ConfigServer();
server.start();
