import { beforeEach, describe, expect, it } from "vitest";
import type { Clock, Sleep } from "../src/clock.ts";
import { FakeMetricsProvider, type FakeStep } from "../src/fake-provider.ts";
import type { Connection, PostMetricSnapshot, SyncWindow } from "../src/provider.ts";
import { MetricsStore } from "../src/store.ts";
import { MetricsSyncService, SyncFailedError } from "../src/sync.ts";

const CONNECTION: Connection = { id: "con_1", platform: "instagram", accessToken: "fake" };

function recordingSleep(): { sleep: Sleep; waits: number[] } {
  const waits: number[] = [];
  return {
    waits,
    sleep: async (ms) => {
      waits.push(ms);
    },
  };
}

function fixedClock(iso: string): Clock {
  const at = new Date(iso);
  return () => at;
}

function post(id: string, capturedAt: string, views: number): PostMetricSnapshot {
  return { postId: id, capturedAt, views, likes: 0, comments: 0 };
}

function windowBetween(since: string, until: string): SyncWindow {
  return { since: new Date(since), until: new Date(until) };
}

function build(steps: FakeStep[], options = {}) {
  const provider = new FakeMetricsProvider(steps);
  const store = new MetricsStore();
  const timer = recordingSleep();
  const service = new MetricsSyncService(
    provider,
    store,
    fixedClock("2026-06-01T12:00:00.000Z"),
    timer.sleep,
    options,
  );
  return { provider, store, service, waits: timer.waits };
}

describe("idempotência do sync", () => {
  it("não conta o mesmo post duas vezes em janelas sobrepostas", async () => {
    const snapshot = post("post_1", "2026-05-30T00:00:00.000Z", 1000);
    const { service, store } = build([
      { kind: "ok", posts: [snapshot] },
      { kind: "ok", posts: [snapshot] },
    ]);

    const first = await service.sync(CONNECTION, windowBetween("2026-05-29T00:00:00.000Z", "2026-05-31T00:00:00.000Z"));
    const second = await service.sync(CONNECTION, windowBetween("2026-05-30T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(store.list(CONNECTION.id)).toHaveLength(1);
  });

  it("deduplica o mesmo snapshot repetido numa única resposta", async () => {
    const snapshot = post("post_1", "2026-05-30T00:00:00.000Z", 1000);
    const { service, store } = build([{ kind: "ok", posts: [snapshot, snapshot] }]);
    const result = await service.sync(CONNECTION, windowBetween("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(store.list(CONNECTION.id)).toHaveLength(1);
  });

  it("guarda uma nova medição do mesmo post quando o captured_at muda", async () => {
    const { service, store } = build([
      { kind: "ok", posts: [post("post_1", "2026-05-30T00:00:00.000Z", 1000)] },
      { kind: "ok", posts: [post("post_1", "2026-05-31T00:00:00.000Z", 1500)] },
    ]);
    await service.sync(CONNECTION, windowBetween("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));
    await service.sync(CONNECTION, windowBetween("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));
    expect(store.list(CONNECTION.id)).toHaveLength(2);
  });
});

describe("limite de taxa", () => {
  it("espera o Retry-After do provedor quando está abaixo do teto", async () => {
    const { service, waits, store } = build(
      [{ kind: "rate_limit", retryAfterMs: 1500 }, { kind: "ok", posts: [post("post_1", "2026-05-30T00:00:00.000Z", 10)] }],
      { maxBackoffMs: 5000 },
    );
    const result = await service.sync(CONNECTION, windowBetween("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));
    expect(waits).toEqual([1500]);
    expect(result.inserted).toBe(1);
  });

  it("não espera mais que o teto configurado", async () => {
    const { service, waits } = build(
      [{ kind: "rate_limit", retryAfterMs: 60_000 }, { kind: "ok", posts: [] }],
      { maxBackoffMs: 2000 },
    );
    await service.sync(CONNECTION, windowBetween("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));
    expect(waits).toEqual([2000]);
  });
});

describe("falha transitória", () => {
  it("tenta de novo com teto de tentativas e não entra em loop", async () => {
    const { service, waits } = build([{ kind: "timeout" }], { maxAttempts: 3, baseBackoffMs: 100, maxBackoffMs: 1000 });
    await expect(
      service.sync(CONNECTION, windowBetween("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z")),
    ).rejects.toBeInstanceOf(SyncFailedError);
    expect(waits).toEqual([100, 200]);
  });

  it("recupera depois de um timeout isolado", async () => {
    const { service, store } = build([
      { kind: "timeout" },
      { kind: "ok", posts: [post("post_1", "2026-05-30T00:00:00.000Z", 10)] },
    ]);
    const result = await service.sync(CONNECTION, windowBetween("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));
    expect(result.attempts).toBe(2);
    expect(store.list(CONNECTION.id)).toHaveLength(1);
  });
});

describe("rastreabilidade", () => {
  it("registra quando a métrica foi buscada", async () => {
    const { service, store } = build([{ kind: "ok", posts: [post("post_1", "2026-05-30T00:00:00.000Z", 10)] }]);
    await service.sync(CONNECTION, windowBetween("2026-05-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"));
    expect(store.list(CONNECTION.id)[0]?.fetchedAt).toBe("2026-06-01T12:00:00.000Z");
  });
});
