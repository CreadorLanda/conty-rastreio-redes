import type { Clock, Sleep } from "./clock.ts";
import {
  type Connection,
  type MetricsProvider,
  type PostMetricSnapshot,
  ProviderRateLimitError,
  ProviderTimeoutError,
  type SyncWindow,
} from "./provider.ts";
import type { MetricsStore, UpsertResult } from "./store.ts";

export type SyncOptions = {
  maxAttempts: number;
  maxBackoffMs: number;
  baseBackoffMs: number;
};

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  maxAttempts: 4,
  maxBackoffMs: 30_000,
  baseBackoffMs: 200,
};

export type SyncResult = UpsertResult & {
  fetched: number;
  attempts: number;
  waitedMs: number;
  fetchedAt: string;
};

export class SyncFailedError extends Error {
  constructor(readonly attempts: number, readonly cause: unknown) {
    super(`sincronização falhou após ${attempts} tentativas`);
    this.name = "SyncFailedError";
  }
}

export class MetricsSyncService {
  private readonly options: SyncOptions;

  constructor(
    private readonly provider: MetricsProvider,
    private readonly store: MetricsStore,
    private readonly clock: Clock,
    private readonly sleep: Sleep,
    options: Partial<SyncOptions> = {},
  ) {
    this.options = { ...DEFAULT_SYNC_OPTIONS, ...options };
  }

  async sync(connection: Connection, window: SyncWindow): Promise<SyncResult> {
    let waitedMs = 0;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        const snapshots = await this.provider.fetchMetrics(connection, window);
        const fetchedAt = this.clock().toISOString();
        const upserted = this.store.upsert(connection.id, snapshots, fetchedAt);
        return { ...upserted, fetched: snapshots.length, attempts: attempt, waitedMs, fetchedAt };
      } catch (error) {
        const wait = this.waitFor(error, attempt);
        if (wait === null) throw new SyncFailedError(attempt, error);
        waitedMs += wait;
        if (wait > 0) await this.sleep(wait);
      }
    }
  }

  private waitFor(error: unknown, attempt: number): number | null {
    if (attempt >= this.options.maxAttempts) return null;
    if (error instanceof ProviderRateLimitError) {
      return Math.min(error.retryAfterMs, this.options.maxBackoffMs);
    }
    if (error instanceof ProviderTimeoutError) {
      return Math.min(this.options.baseBackoffMs * 2 ** (attempt - 1), this.options.maxBackoffMs);
    }
    return null;
  }
}

export function snapshotWindow(now: Date, lookbackMs: number): SyncWindow {
  return { since: new Date(now.getTime() - lookbackMs), until: now };
}

export type { PostMetricSnapshot };
