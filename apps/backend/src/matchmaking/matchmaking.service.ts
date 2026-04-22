import { Injectable, Logger } from '@nestjs/common';
import { QueueStore, QueueEntry } from './queue-store';

export interface MatchResult {
  a: QueueEntry;
  b: QueueEntry;
  mode: string;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(private readonly store: QueueStore) {}

  /**
   * Adds an entry and attempts to find a match immediately.
   * Returns a MatchResult if paired; undefined if still queued.
   */
  async enqueue(entry: QueueEntry): Promise<MatchResult | undefined> {
    const existing = await this.store.all(entry.mode);
    const tolerance = this.tolerance(entry.enqueuedAt);
    const opponent = existing.find(
      (e) => e.userId !== entry.userId && Math.abs(e.rating - entry.rating) <= tolerance,
    );
    if (opponent) {
      await this.store.remove(entry.mode, opponent.userId);
      return { a: opponent, b: entry, mode: entry.mode };
    }
    await this.store.push(entry.mode, entry);
    return undefined;
  }

  async dequeue(userId: string) {
    await this.store.removeAll(userId);
  }

  /**
   * Broad tolerance expands over time — fresh entries only match within ±50 rating,
   * after 30s anyone within ±400, after 60s anyone at all.
   */
  private tolerance(enqueuedAt: number): number {
    const waited = (Date.now() - enqueuedAt) / 1000;
    if (waited < 5) return 50;
    if (waited < 15) return 150;
    if (waited < 30) return 400;
    if (waited < 60) return 1000;
    return 99999;
  }

  /**
   * Drains queue entries that have been waiting longer than `thresholdMs`
   * so the caller can fall them back onto a Stockfish game.
   */
  async takeBotFallbacks(thresholdMs: number): Promise<QueueEntry[]> {
    const now = Date.now();
    const modes = await this.store.modes();
    const picked: QueueEntry[] = [];
    for (const mode of modes) {
      const entries = await this.store.all(mode);
      for (const e of entries) {
        if (now - e.enqueuedAt >= thresholdMs) {
          await this.store.remove(mode, e.userId);
          picked.push(e);
        }
      }
    }
    return picked;
  }

  /** Periodic sweep — re-try matches for still-queued entries as tolerance widens. */
  async sweep(): Promise<MatchResult[]> {
    const modes = await this.store.modes();
    const matches: MatchResult[] = [];
    for (const mode of modes) {
      const entries = await this.store.all(mode);
      const sorted = [...entries].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      const paired = new Set<string>();
      for (const a of sorted) {
        if (paired.has(a.userId)) continue;
        const tol = this.tolerance(a.enqueuedAt);
        const opponent = sorted.find(
          (b) => b.userId !== a.userId && !paired.has(b.userId) && Math.abs(b.rating - a.rating) <= tol,
        );
        if (opponent) {
          paired.add(a.userId);
          paired.add(opponent.userId);
          await this.store.remove(mode, a.userId);
          await this.store.remove(mode, opponent.userId);
          matches.push({ a, b: opponent, mode });
        }
      }
    }
    return matches;
  }
}
