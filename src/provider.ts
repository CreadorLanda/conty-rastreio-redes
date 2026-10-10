export type Platform = "instagram" | "tiktok" | "youtube" | "x";

export type Connection = {
  id: string;
  platform: Platform;
  accessToken: string;
};

export type SyncWindow = {
  since: Date;
  until: Date;
};

export type PostMetricSnapshot = {
  postId: string;
  capturedAt: string;
  views: number;
  likes: number;
  comments: number;
};

export interface MetricsProvider {
  fetchMetrics(connection: Connection, window: SyncWindow): Promise<PostMetricSnapshot[]>;
}

export class ProviderTimeoutError extends Error {
  constructor(message = "provider timeout") {
    super(message);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderRateLimitError extends Error {
  constructor(readonly retryAfterMs: number, message = "provider rate limited") {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}
