import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { systemClock, systemSleep } from "./clock.ts";
import { FakeMetricsProvider } from "./fake-provider.ts";
import type { Connection } from "./provider.ts";
import { MetricsStore } from "./store.ts";
import { MetricsSyncService } from "./sync.ts";

const connection: Connection = { id: "con_demo", platform: "instagram", accessToken: "fake-token" };

const provider = new FakeMetricsProvider([
  { kind: "rate_limit", retryAfterMs: 400 },
  {
    kind: "ok",
    posts: [
      { postId: "post_1", capturedAt: new Date().toISOString(), views: 1200, likes: 90, comments: 12 },
      { postId: "post_2", capturedAt: new Date().toISOString(), views: 540, likes: 33, comments: 4 },
    ],
  },
]);

const store = new MetricsStore();
const service = new MetricsSyncService(provider, store, systemClock, systemSleep);
const connections = new Map<string, Connection>([[connection.id, connection]]);

const port = Number(process.env.PORT ?? 3004);

serve(
  { fetch: createApp({ service, store, connections, clock: systemClock, lookbackMs: 7 * 24 * 60 * 60 * 1000 }).fetch, port },
  (info) => {
    console.log(`rastreio de redes em http://127.0.0.1:${info.port}`);
  },
);
