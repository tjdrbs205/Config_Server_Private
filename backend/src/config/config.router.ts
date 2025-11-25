import { Router } from "express";
import dotenv from "dotenv";
import Phase, { GetSecretOptions } from "@phase.dev/phase-node";

import { ConfigService } from "../config/config.service";
import { SecretReader } from "../common/secretReader";
dotenv.config();

const phase = new SecretReader(new Phase(process.env.PHASE_API_KEY || ""));

const configRouter = Router();
const configService = new ConfigService();

configRouter.get("/:application/:profile", async (req, res) => {
  const { application, profile } = req.params;
  const file = await configService.getConfigFile(application, profile);
  res.send({ application, profile, propertySources: file });
});

const testOptions: GetSecretOptions = {
  appId: "e2b33708-9a1a-4d57-aecd-c932b0dff28c",
  envName: "Development",
  path: "/",
};
configRouter.get("/test", async (req, res) => {
  const data = await phase.get(testOptions);
  res.send({ data });
});

export default configRouter;
