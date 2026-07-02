import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import { pinoHttp } from "pino-http";
import type { ApiRequest } from "./request.js";

/** Assigns a trace id to every request and emits one structured log line per request. */
export function traceMiddleware() {
  const logger = pinoHttp({
    genReqId: (req) => (req.headers["x-trace-id"] as string) ?? randomUUID(),
  });
  return (req: ApiRequest, res: Response, next: NextFunction) => {
    req.traceId = (req.headers["x-trace-id"] as string) ?? randomUUID();
    res.setHeader("x-trace-id", req.traceId);
    logger(req, res);
    next();
  };
}
