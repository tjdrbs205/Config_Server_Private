import { Router } from "express";
import { ConfigController } from "./config.controller";
const ConfigRouter = Router();

const configController = new ConfigController();

ConfigRouter.get("/env", configController.getEnvTest);
ConfigRouter.get("/env_data", configController.getTestApi);

export default ConfigRouter;
