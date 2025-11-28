import { ErrorRequestHandler, NextFunction, Request, Response } from "express";

export const errorHandler: ErrorRequestHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).send({
    timestamp: new Date().toISOString(),
    status,
    error: status === 500 ? "Internal Server Error" : message,
    message,
    path: req.originalUrl,
  });
};
