import express, { Application } from "express";
import cors from "cors";

import { errorHandler } from "./common/middleware/error.middleware";

import { EnvironmentValue } from "./common/environmentValue";
import configRouter from "../src/config/config.router";
import { apiKeyAuth } from "./common/middleware/auth.middleware";

class ConfigServer {
  private app: Application = express();
  private env: EnvironmentValue;
  constructor() {
    this.env = EnvironmentValue.getInstance();
  }

  async init() {
    this.preMiddleware();
  }

  preMiddleware() {
    this.app.use(express.json());
    this.app.use(cors());
    console.log("Server Mode:", this.env.SERVER_MODE);
    if (this.env.SERVER_MODE === "production") {
      this.app.use(apiKeyAuth);
    }
    this.router();
    this.app.use(errorHandler);
  }

  async router() {
    this.app.use("/", configRouter);
  }

  async start() {
    await this.init();
    const port = this.env.PORT;
    this.app.listen(port, () => {
      console.log(`Config Server is running on port ${port}`);
    });
  }
}

const server = new ConfigServer();
server.start();
