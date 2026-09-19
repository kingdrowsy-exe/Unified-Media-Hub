import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { NotConfiguredError } from "./settingsStore.js";
import { onDemandRoutes } from "./routes/ondemand.js";
import { liveRoutes } from "./routes/live.js";
import { streamRoutes } from "./routes/stream.js";
import { settingsRoutes } from "./routes/settings.js";
import { popularRoutes } from "./routes/popular.js";
import { detailsRoutes } from "./routes/details.js";
import { traktRoutes } from "./routes/trakt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.setErrorHandler((err: Error, request, reply) => {
    if (err instanceof NotConfiguredError) {
      reply.code(409).send({ error: "not_configured", service: err.service });
      return;
    }
    request.log.error(err);
    reply.code(500).send({ error: "internal_error", message: err.message });
  });

  await app.register(settingsRoutes);
  await app.register(onDemandRoutes);
  await app.register(popularRoutes);
  await app.register(liveRoutes);
  await app.register(streamRoutes);
  await app.register(detailsRoutes);
  await app.register(traktRoutes);

  const webDist = path.join(__dirname, "../../web/dist");
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api")) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    reply.sendFile("index.html");
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  return app;
}

// Runnable standalone (`node dist/index.js`) for testing this copy outside Electron;
// the packaged app instead imports startServer() directly from electron/main.js.
const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
