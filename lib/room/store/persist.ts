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
  /** v19: idempotency. Stored in the same transaction as the commit (room_commit p_idem_*). */
  idem?: { key: string; response: unknown; status: number } | null;
  /** v21: invite index rows to write in the same transaction (hashes only). */
  invites?: InviteChanges | null;
};

/** v21: invites minted / used / cancelled by this commit (sha256 hashes only, never codes). */
export type InviteChanges = { add: { hash: string; expMs: number }[]; use: string[]; cancel: string[] };

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
  /** v19: read a stored idempotent response without writing anything. */
  idemGet?(key: string): Promise<{ response: unknown; status: number } | null>;
  kvPut?(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** Test hook. Runs after the engine and before the compare-and-set. */
  beforeCommit?: () => Promise<void>;
};

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** v19: full jitter, random(0, min(400, 50·2^attempt)) ms. */
export function retryPause(attempt: number) {
  return Math.floor(Math.random() * Math.min(400, 50 * 2 ** attempt));
}
