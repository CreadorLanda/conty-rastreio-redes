import {
  type Connection,
  type MetricsProvider,
  type PostMetricSnapshot,
  ProviderRateLimitError,
  ProviderTimeoutError,
  type SyncWindow,
} from "./provider.ts";

export type FakeStep =
  | { kind: "ok"; posts: PostMetricSnapshot[] }
  | { kind: "timeout" }
  | { kind: "rate_limit"; retryAfterMs: number };

export class FakeMetricsProvider implements MetricsProvider {
  private readonly steps: FakeStep[];
  private cursor = 0;
  readonly calls: Array<{ connection: Connection; window: SyncWindow }> = [];

  constructor(steps: FakeStep[]) {
    this.steps = steps;
  }

  async fetchMetrics(connection: Connection, window: SyncWindow): Promise<PostMetricSnapshot[]> {
    this.calls.push({ connection, window });
    const step = this.steps[Math.min(this.cursor, this.steps.length - 1)];
    this.cursor += 1;
    if (!step || step.kind === "ok") {
      return withinWindow(step?.posts ?? [], window);
    }
    if (step.kind === "timeout") throw new ProviderTimeoutError();
    throw new ProviderRateLimitError(step.retryAfterMs);
  }
}

function withinWindow(posts: PostMetricSnapshot[], window: SyncWindow): PostMetricSnapshot[] {
  const since = window.since.getTime();
  const until = window.until.getTime();
  return posts.filter((post) => {
    const captured = new Date(post.capturedAt).getTime();
    return captured >= since && captured <= until;
  });
}
