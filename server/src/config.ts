import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 300),
};
