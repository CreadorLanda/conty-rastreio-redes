import { Hono } from "hono";
import type { Clock } from "./clock.ts";
import type { Connection } from "./provider.ts";
import type { MetricsStore } from "./store.ts";
import { MetricsSyncService, SyncFailedError, snapshotWindow } from "./sync.ts";

export type AppDeps = {
  service: MetricsSyncService;
  store: MetricsStore;
  connections: Map<string, Connection>;
  clock: Clock;
  lookbackMs: number;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/connections/:id/sync", async (c) => {
    const connection = deps.connections.get(c.req.param("id"));
    if (!connection) return c.json({ error: "conexão não encontrada" }, 404);
    try {
      const window = snapshotWindow(deps.clock(), deps.lookbackMs);
      const result = await deps.service.sync(connection, window);
      return c.json(result);
    } catch (error) {
      if (error instanceof SyncFailedError) {
        return c.json({ error: error.message, attempts: error.attempts }, 502);
      }
      throw error;
    }
  });

  app.get("/connections/:id/metrics", (c) => {
    const connection = deps.connections.get(c.req.param("id"));
    if (!connection) return c.json({ error: "conexão não encontrada" }, 404);
    return c.json({ connection_id: connection.id, snapshots: deps.store.list(connection.id) });
  });

  return app;
}
