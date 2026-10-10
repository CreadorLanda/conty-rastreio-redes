import type { PostMetricSnapshot } from "./provider.ts";

export type StoredSnapshot = PostMetricSnapshot & {
  connectionId: string;
  fetchedAt: string;
};

export type UpsertResult = {
  inserted: number;
  duplicates: number;
};

export class MetricsStore {
  private readonly byKey = new Map<string, StoredSnapshot>();

  upsert(connectionId: string, snapshots: PostMetricSnapshot[], fetchedAt: string): UpsertResult {
    let inserted = 0;
    let duplicates = 0;
    for (const snapshot of snapshots) {
      const key = identity(connectionId, snapshot);
      if (this.byKey.has(key)) {
        duplicates += 1;
        continue;
      }
      this.byKey.set(key, { ...snapshot, connectionId, fetchedAt });
      inserted += 1;
    }
    return { inserted, duplicates };
  }

  list(connectionId: string): StoredSnapshot[] {
    return [...this.byKey.values()]
      .filter((snapshot) => snapshot.connectionId === connectionId)
      .sort((left, right) =>
        left.postId === right.postId
          ? left.capturedAt.localeCompare(right.capturedAt)
          : left.postId.localeCompare(right.postId),
      );
  }
}

function identity(connectionId: string, snapshot: PostMetricSnapshot): string {
  return `${connectionId}\u0000${snapshot.postId}\u0000${snapshot.capturedAt}`;
}
