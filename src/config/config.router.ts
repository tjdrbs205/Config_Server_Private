import { Router, Request, Response } from "express";

import { ConfigService } from "../config/config.service";
import { parseApplicationProfile } from "../common/utils/configParser";

const configRouter = Router();
const configService = new ConfigService();

/**
 * POST /actuator/secrets/refresh
 * Refresh secrets from Phase on-demand
 */
configRouter.post("/actuator/secrets/refresh", async (req: Request, res: Response) => {
  const result = await configService.refreshSecrets();
  res.json({
    status: result.status,
    loadedAt: result.loadedAt,
  });
});
/**
 * GET /{application}/{profile}
 */
configRouter.get("/:application/:profile", async (req: Request, res: Response) => {
  const { application, profile } = req.params;
  const config = await configService.getConfig(application, profile);
  res.json(config);
});

/**
 * GET /{application}/{profile}/{label}
 */
configRouter.get("/:application/:profile/:label", async (req: Request, res: Response) => {
  const { application, profile, label } = req.params;
  const config = await configService.getConfig(application, profile, label);
  res.json(config);
});

/**
 * GET /{label}/{application}-{profile}.yml
 * GET /{label}/{application}-{profile}.yaml
 */
configRouter.get("/:label/:name.yml", handleYamlConfig);
configRouter.get("/:label/:name.yaml", handleYamlConfig);

async function handleYamlConfig(req: Request, res: Response) {
  const { label, name } = req.params;
  const { application, profile } = parseApplicationProfile(name);
  const yaml = await configService.getConfigAsYaml(application, profile, label);
  res.type("text/yaml").send(yaml);
}

/**
 * GET /{label}/{application}-{profile}.properties
 */
configRouter.get("/:label/:name.properties", async (req: Request, res: Response) => {
  const { label, name } = req.params;
  const { application, profile } = parseApplicationProfile(name);
  const properties = await configService.getConfigAsProperties(application, profile, label);
  res.type("text/plain").send(properties);
});

/**
 * GET /{label}/{application}-{profile}.json
 */
configRouter.get("/:label/:name.json", async (req: Request, res: Response) => {
  const { label, name } = req.params;
  const { application, profile } = parseApplicationProfile(name);
  const json = await configService.getConfigAsJson(application, profile, label);
  res.json(json);
});

/**
 * GET /{application}-{profile}.yml (without label)
 * GET /{application}-{profile}.yaml (whitout label)
 */
configRouter.get("/:name.yml", handleYamlConfigNoLabel);
configRouter.get("/:name.yaml", handleYamlConfigNoLabel);

async function handleYamlConfigNoLabel(req: Request, res: Response) {
  const { name } = req.params;
  const { application, profile } = parseApplicationProfile(name);
  const yaml = await configService.getConfigAsYaml(application, profile);
  res.type("text/yaml").send(yaml);
}

/**
 * GET /{application}-{profile}.properties (whitout label)
 */
configRouter.get("/:name.properties", async (req: Request, res: Response) => {
  const { name } = req.params;
  const { application, profile } = parseApplicationProfile(name);
  const properties = await configService.getConfigAsProperties(application, profile);
  res.type("text/plain").send(properties);
});

/**
 * GET /{application}-{profile}.json (whitout label)
 */
configRouter.get("/:name.json", async (req: Request, res: Response) => {
  const { name } = req.params;
  const { application, profile } = parseApplicationProfile(name);
  const json = await configService.getConfigAsJson(application, profile);
  res.json(json);
});

export default configRouter;
