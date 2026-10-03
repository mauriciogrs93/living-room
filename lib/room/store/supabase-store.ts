import type { Mailbox } from "@/lib/room/mailbox";
import { RoomUnavailable } from "@/lib/room/errors";
import { currentSignal } from "@/lib/room/request-signal";
import { decodeState, encodeState, hashToken } from "@/lib/room/store/codec";
import { supabaseConfig } from "@/lib/room/store/config";
import type { MailWrite, RoomCommit, RoomPersistence, RoomRead, SeenStamp } from "@/lib/room/store/persist";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

const RPC_MS = 3000;

function asMailbox(raw: unknown): Mailbox | null {
  if (!raw || typeof raw !== "object") return null;
  const box = raw as Partial<Mailbox>;
  if (typeof box.ownerKey !== "string" || typeof box.agentId !== "string" || typeof box.name !== "string") return null;
  return raw as Mailbox;
}

function clip(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 200);
}

function failRpc(fn: string, status: number, code: string, message: string): never {
  console.error("[supabase]", fn, status, code, clip(message));
  throw new RoomUnavailable();
}

function rpcHeaders(secret: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: secret,
    "Content-Type": "application/json",
  };
  if (secret.startsWith("eyJ")) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

export function supabaseRpc(url: string, secret: string): Rpc {
  const headers = rpcHeaders(secret);
  return async (fn, args) => {
    const timeout = AbortSignal.timeout(RPC_MS);
    const parent = currentSignal();
    const signal = parent ? AbortSignal.any([parent, timeout]) : timeout;
    try {
      const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
        cache: "no-store",
        signal,
      });
      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          failRpc(fn, response.status, "invalid-json", text);
        }
      }
      if (!response.ok) {
        const record = payload && typeof payload === "object" ? (payload as { message?: unknown; code?: unknown }) : {};
        const message = typeof record.message === "string" && record.message ? record.message : text;
        const code = typeof record.code === "string" ? record.code : "";
        failRpc(fn, response.status, code, message || `Supabase ${fn} returned ${response.status}.`);
      }
      return payload;
    } catch (error) {
      if (error instanceof RoomUnavailable) throw error;
      const name = error instanceof Error ? error.name : "error";
      const message = error instanceof Error ? error.message : "fetch failed";
      failRpc(fn, 0, name, message);
    }
  };
}

function presenceOf(raw: { presence?: { agent_id?: string; seen_ms?: number }[] } | null): SeenStamp[] {
  const seen: SeenStamp[] = [];
  for (const stamp of raw?.presence ?? []) {
    if (typeof stamp.agent_id === "string" && Number.isFinite(Number(stamp.seen_ms))) {
      seen.push([stamp.agent_id, Number(stamp.seen_ms)]);
    }
  }
  return seen;
}

export class SupabaseStore implements RoomPersistence {
  constructor(private readonly rpc: Rpc) {}

  static fromEnv(): SupabaseStore | null {
    const config = supabaseConfig();
    if (!config) return null;
    return new SupabaseStore(supabaseRpc(config.url, config.secret));
  }

  async read(knownVersion: number | null): Promise<RoomRead> {
    const raw = (await this.rpc("room_read", { p_known_version: knownVersion })) as {
      version?: number;
      unchanged?: boolean;
      state_gz?: string | null;
      presence?: { agent_id?: string; seen_ms?: number }[];
    };
    const version = Number(raw?.version ?? 0);
    const seen = presenceOf(raw);
    if (raw?.unchanged) return { version, unchanged: true, raw: null, seen };
    const json = typeof raw?.state_gz === "string" && raw.state_gz ? decodeState(raw.state_gz) : null;
    return { version, unchanged: false, raw: json, seen };
  }

  async commit(input: RoomCommit) {
    const mail = input.mail.map((change) => ({
      owner_key: change.ownerKey,
      data: change.data,
      token_hash: change.tokenHash,
      drop_hashes: change.dropHashes,
    }));
    const raw = (await this.rpc("room_commit", {
      p_expected: input.expectedVersion,
      p_state: encodeState(input.stateJson),
      p_public_door: input.publicDoor,
      p_mail: mail,
      p_agent_ids: input.agentIds,
      p_room_changed: input.roomChanged,
      p_idem_key: null,
      p_idem_response: null,
      p_idem_status: null,
    })) as { conflict?: boolean; version?: number; idempotent?: boolean; response?: unknown; status?: number };
    if (raw?.conflict) return { conflict: true as const };
    return {
      conflict: false as const,
      version: Number(raw?.version ?? (input.roomChanged ? input.expectedVersion + 1 : input.expectedVersion)),
      idempotent: raw?.idempotent === true,
      response: raw?.response,
      status: raw?.status,
    };
  }

  async rateHit(key: string, limit: number, windowMs: number) {
    const raw = (await this.rpc("rate_hit", { p_key: key, p_limit: limit, p_window_ms: windowMs })) as {
      limited?: boolean;
      retry_after_ms?: number;
    };
    return { limited: raw?.limited === true, retryAfterMs: Number(raw?.retry_after_ms ?? 0) };
  }

  async touchPresence(agentId: string, seenAtMs: number) {
    await this.rpc("presence_touch", { p_agent_id: agentId, p_seen_ms: seenAtMs });
  }

  async loadOwner(ownerKey: string) {
    return asMailbox(await this.rpc("mail_owner", { p_owner_key: ownerKey }));
  }

  async loadToken(token: string) {
    return asMailbox(await this.rpc("mail_token", { p_token_hash: hashToken(token) }));
  }

  async kvGet(key: string) {
    return this.rpc("kv_get", { p_key: key });
  }

  async kvPut(key: string, value: unknown, ttlSeconds: number) {
    await this.rpc("kv_put", { p_key: key, p_value: value, p_ttl_seconds: ttlSeconds });
  }
}

export function mailWrite(change: { ownerKey: string; data: Mailbox; dropTokens: string[] }): MailWrite {
  return {
    ownerKey: change.ownerKey,
    data: change.data,
    tokenHash: change.data.token ? hashToken(change.data.token) : "",
    dropHashes: change.dropTokens.filter(Boolean).map(hashToken),
  };
}
