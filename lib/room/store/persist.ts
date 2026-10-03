import type { Mailbox } from "@/lib/room/mailbox";

export type SeenStamp = [string, number];

export type RoomRead = {
  version: number;
  unchanged: boolean;
  /** JSON from serialize(), or null when the room row does not exist yet. */
  raw: string | null;
  seen: SeenStamp[];
};

export type MailWrite = {
  ownerKey: string;
  data: Mailbox;
  tokenHash: string;
  dropHashes: string[];
};

export type RoomCommit = {
  expectedVersion: number;
  stateJson: string;
  publicDoor: { locked: boolean; knocking: boolean };
  mail: MailWrite[];
  agentIds: string[];
  /** False keeps the room version, blob, and broadcast unchanged. Mail still commits. */
  roomChanged: boolean;
};

export type RoomCommitResult =
  | { conflict: true }
  | { conflict: false; version: number; idempotent?: boolean; response?: unknown; status?: number };

/** What SharedRoom used Redis for: room blob, mail, presence, and rate limits. */
export type RoomPersistence = {
  read(knownVersion: number | null): Promise<RoomRead>;
  commit(input: RoomCommit): Promise<RoomCommitResult>;
  rateHit(key: string, limit: number, windowMs: number): Promise<{ limited: boolean; retryAfterMs: number }>;
  touchPresence(agentId: string, seenAtMs: number): Promise<void>;
  loadOwner(ownerKey: string): Promise<Mailbox | null>;
  loadToken(token: string): Promise<Mailbox | null>;
  kvGet?(key: string): Promise<unknown>;
  kvPut?(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** Test hook. Runs after the engine and before the compare-and-set. */
  beforeCommit?: () => Promise<void>;
};

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryPause(attempt: number) {
  const span = Math.min(80, 10 * 2 ** attempt);
  return 10 + Math.floor(Math.random() * span);
}
