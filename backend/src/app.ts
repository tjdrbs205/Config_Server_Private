import express, { Application } from "express";
import basicAuth from "express-basic-auth";
import cors from "cors";

import ConfigRouter from "./module/config/config.router";

class ConfigServer {
  private app: Application = express();

  constructor() {
    this.preMiddleware();
    this.router();
  }

  async preMiddleware() {
    console.log("Pre-middleware setup");
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
    console.log("Router setup");
    this.app.use("/config", ConfigRouter);
  }

  async start() {
    const port = process.env.PORT || 3000;
    this.app.listen(port, () => {
      console.log(`Config server is running on port ${port}`);
    });
  }
}

const server = new ConfigServer();
server.start();
