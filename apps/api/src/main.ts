import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { traceMiddleware } from "./common/trace.middleware.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" });
  app.use(traceMiddleware());
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(JSON.stringify({ level: "info", msg: "api listening", port }));
}

bootstrap();
