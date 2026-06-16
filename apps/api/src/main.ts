import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  const configuredOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isConfiguredOrigin = configuredOrigins.includes(origin);
      const isLocalDevOrigin =
        process.env.NODE_ENV !== "production" &&
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

      callback(null, isConfiguredOrigin || isLocalDevOrigin);
    },
    credentials: true,
  });
  app.use((request: { requestId?: string; headers: Record<string, string> }, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    const requestId = request.headers["x-request-id"] ?? randomUUID();
    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  });

  const swagger = new DocumentBuilder()
    .setTitle("Remorra API")
    .setDescription("Product intelligence API for the DRIVE workflow")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
