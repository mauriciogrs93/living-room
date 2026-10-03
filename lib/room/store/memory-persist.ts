import { hashToken } from "@/lib/room/store/codec";
import type { Mailbox } from "@/lib/room/mailbox";
import type { MailWrite, RoomCommit, RoomPersistence, RoomRead, SeenStamp } from "@/lib/room/store/persist";

type MailRow = { data: Mailbox; tokenHash: string; expiresAt: number };

/** In-process stand-in for the SQL functions. Used to test compare-and-set. */
export class MemoryPersist implements RoomPersistence {
  version = 0;
  state: string | null = null;
  door = { locked: true, knocking: false };
  seen = new Map<string, number>();
  rates = new Map<string, { count: number; windowEnd: number }>();
  mail = new Map<string, MailRow>();
  tokens = new Map<string, { ownerKey: string; expiresAt: number }>();
  beforeCommit?: () => Promise<void>;

  async read(knownVersion: number | null): Promise<RoomRead> {
    const seen: SeenStamp[] = [...this.seen.entries()];
    if (knownVersion != null && knownVersion === this.version && this.state != null) {
      return { version: this.version, unchanged: true, raw: null, seen };
    }
    return { version: this.version, unchanged: false, raw: this.state, seen };
  }

  async commit(input: RoomCommit) {
    if (this.beforeCommit) await this.beforeCommit();
    if (input.expectedVersion !== this.version) return { conflict: true as const };
    if (input.roomChanged) {
      this.version += 1;
      this.state = input.stateJson;
      this.door = input.publicDoor;
      const living = new Set(input.agentIds);
      for (const id of [...this.seen.keys()]) {
        if (!living.has(id)) this.seen.delete(id);
      }
    }
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    for (const change of input.mail) {
      this.mail.set(change.ownerKey, { data: change.data, tokenHash: change.tokenHash, expiresAt });
      if (change.tokenHash) this.tokens.set(change.tokenHash, { ownerKey: change.ownerKey, expiresAt });
      for (const hash of change.dropHashes) this.tokens.delete(hash);
    }
    return { conflict: false as const, version: this.version };
  }

  async rateHit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const current = this.rates.get(key);
    if (!current || current.windowEnd <= now) {
      this.rates.set(key, { count: 1, windowEnd: now + windowMs });
      return { limited: 1 > limit, retryAfterMs: windowMs };
    }
    current.count += 1;
    return { limited: current.count > limit, retryAfterMs: Math.max(0, current.windowEnd - now) };
  }

  async touchPresence(agentId: string, seenAtMs: number) {
    this.seen.set(agentId, seenAtMs);
  }

  async loadOwner(ownerKey: string) {
    const row = this.mail.get(ownerKey);
    if (!row || row.expiresAt <= Date.now()) return null;
    return row.data;
  }

  async loadToken(token: string) {
    const found = this.tokens.get(hashToken(token));
    if (!found || found.expiresAt <= Date.now()) return null;
    return this.loadOwner(found.ownerKey);
  }
}
