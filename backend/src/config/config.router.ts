import { Router } from "express";
import { ConfigService } from "../config/config.service";

const configRouter = Router();
const configService = new ConfigService();

configRouter.get("/:application/:profile", async (req, res) => {
  const { application, profile } = req.params;
  const file = await configService.getConfigFile(application, profile);
  res.send({ application, profile, propertySources: file });
});

export default configRouter;
