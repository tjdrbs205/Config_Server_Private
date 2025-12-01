import { NextFunction, Request, Response } from "express";
import { EnvironmentValue } from "../environmentValue";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.get("x-api-key");
  const env = EnvironmentValue.getInstance();

  if (!apiKey || apiKey !== env.API_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  next();
}
