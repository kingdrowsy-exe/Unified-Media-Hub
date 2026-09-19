import type { FastifyInstance } from "fastify";
import { getOwnedPopularLibrary, searchOwnedLibrary } from "../library.js";

export async function onDemandRoutes(app: FastifyInstance) {
  app.get("/api/ondemand", async (request) => {
    const { search, source } = request.query as { search?: string; source?: string };

    // A real search goes straight to Plex/Silo's own title search (both are targeted,
    // indexed lookups, not a full library scan) rather than filtering the small cached
    // "popular" page, which would miss almost everything you actually own.
    const { merged, sources } = search ? await searchOwnedLibrary(search) : await getOwnedPopularLibrary();

    let items = merged;

    if (source && source !== "all") {
      items = items.filter((item) => item.sources.some((s) => s.source === source));
    }

    return { items, sources };
  });
}
