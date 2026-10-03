import { hashToken } from "@/lib/room/store/codec";
import type { Mailbox } from "@/lib/room/mailbox";
import type { InviteChanges, MailWrite, RoomCommit, RoomPersistence, RoomRead, SeenStamp } from "@/lib/room/store/persist";

/** v21: what the memory apartment directory learns from each commit (token / ownerKey / invite -> apartment). */
export type MemoryIndex = {
  noteToken(hash: string, apartmentId: string): void;
  dropToken(hash: string): void;
  noteOwnerKey(ownerKey: string, apartmentId: string): void;
  noteInvites(changes: InviteChanges, apartmentId: string): void;
};

type MailRow = { data: Mailbox; tokenHash: string; expiresAt: number };

/** In-process stand-in for the SQL functions. Used to test compare-and-set. */
export class MemoryPersist implements RoomPersistence {
  constructor(
    readonly apartmentId = "",
    private readonly index: MemoryIndex | null = null,
  ) {}
  version = 0;
  state: string | null = null;
  door = { locked: true, knocking: false };
  seen = new Map<string, number>();
  rates = new Map<string, { count: number; windowEnd: number }>();
  mail = new Map<string, MailRow>();
  tokens = new Map<string, { ownerKey: string; expiresAt: number }>();
  beforeCommit?: () => Promise<void>;
  idem = new Map<string, { response: unknown; status: number; expiresAt: number }>();

  async idemGet(key: string) {
    const hit = this.idem.get(key);
    if (!hit || hit.expiresAt <= Date.now()) return null;
    return { response: hit.response, status: hit.status };
  }

  async read(knownVersion: number | null): Promise<RoomRead> {
    const seen: SeenStamp[] = [...this.seen.entries()];
    if (knownVersion != null && knownVersion === this.version && this.state != null) {
      return { version: this.version, unchanged: true, raw: null, seen };
    }
    return { version: this.version, unchanged: false, raw: this.state, seen };
  }

  async commit(input: RoomCommit) {
    if (input.idem?.key) {
      const hit = await this.idemGet(input.idem.key);
      if (hit) return { conflict: false as const, version: this.version, idempotent: true, response: hit.response, status: hit.status };
    }
    if (this.beforeCommit) await this.beforeCommit();
    if (input.expectedVersion !== this.version) return { conflict: true as const };
    if (input.idem?.key && input.idem.response != null) {
      this.idem.set(input.idem.key, { response: input.idem.response, status: input.idem.status, expiresAt: Date.now() + 10 * 60_000 });
      if (this.idem.size > 2000) this.idem.delete(this.idem.keys().next().value!);
    }
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
      this.index?.noteOwnerKey(change.ownerKey, this.apartmentId);
      if (change.tokenHash) {
        this.tokens.set(change.tokenHash, { ownerKey: change.ownerKey, expiresAt });
        this.index?.noteToken(change.tokenHash, this.apartmentId);
      }
      for (const hash of change.dropHashes) {
        this.tokens.delete(hash);
        this.index?.dropToken(hash);
      }
    }
    if (input.invites) this.index?.noteInvites(input.invites, this.apartmentId);
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
