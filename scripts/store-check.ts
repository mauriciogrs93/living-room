import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { RoomEngine } from "../lib/room/engine";
import { RoomOffline, RoomUnavailable } from "../lib/room/errors";
import { getEngine, roomFailure } from "../lib/room/access";
import { directory as directoryNow } from "../lib/apartments/directory";
import { flushMail, loadOwner, loadToken, type Mailbox } from "../lib/room/mailbox";
import { redisCallCounts, resetRedisCalls } from "../lib/room/redis";
import { decodeState, encodeState, hashToken } from "../lib/room/store/codec";
import { MemoryPersist } from "../lib/room/store/memory-persist";
import { SupabaseStore, supabaseRpc } from "../lib/room/store/supabase-store";
import { VersionedRoom } from "../lib/room/store/versioned-room";
import type { RoomCommit, RoomPersistence } from "../lib/room/store/persist";

function admitted(result: { ok?: boolean; waiting?: boolean }) {
  return result.ok === true && result.waiting !== true;
}

/** v21: the apartment owner is an account identity; agents come in with a fresh invite. */
const OWNER = "acct_store_check_owner";
type Reg = Awaited<ReturnType<VersionedRoom["register"]>>;
async function ownedRoom(store: RoomPersistence) {
  const room = new VersionedRoom(store);
  await room.setOwnerIdentity(OWNER);
  return room;
}
async function admit(room: VersionedRoom, input: { name: string; emoji: string; color: string; ip: string; note?: string }): Promise<Reg> {
  const minted = await room.doorAct(OWNER, "invite");
  assert.equal(minted.ok, true, "owner mints an invite");
  const invite = minted.ok && "invite" in minted ? String(minted.invite) : "";
  return room.register({ ...input, invite: ` ${invite}. ` });
}

function eventsOf(raw: string | null) {
  if (!raw) return [];
  const saved = JSON.parse(raw) as { events?: { text?: string }[] };
  return saved.events ?? [];
}

function makeBarrier() {
  let arm = false;
  let waiting = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    arm(on: boolean) {
      arm = on;
    },
    async wait() {
      if (!arm) return;
      waiting += 1;
      if (waiting >= 2) release();
      await gate;
    },
  };
}

async function expectSeed(store: RoomPersistence) {
  const room = new VersionedRoom(store);
  const snap = await room.snapshot();
  assert.deepEqual(snap.door, { locked: true, knocking: false });
  const saved = JSON.parse((await store.read(null)).raw ?? "null") as {
    door?: { invite?: string; trusted?: { id?: string; name?: string; ownerKey?: string }[] };
    house?: { books?: { title?: string }[] };
  };
  assert.equal(saved.house?.books?.some((book) => book.title === "House journal"), true);
  assert.equal(saved.door?.trusted?.some((person) => person.id === "agt_b71b2b01" && person.name === "Tester" && person.ownerKey === ""), true);
  assert.equal(saved.door?.trusted?.some((person) => person.name === "Poppy" && person.ownerKey === ""), true);
  assert.equal(JSON.stringify(snap).includes(saved.door?.invite ?? "no-invite"), false);
  assert.equal(JSON.stringify(snap).includes("own_"), false);
  return room;
}

async function expectMailOnly(store: RoomPersistence) {
  const before = await store.read(null);
  assert.equal(typeof before.raw, "string");
  const box: Mailbox = {
    ownerKey: "own_mailonly",
    agentId: "agt_mailonly",
    name: "Mail",
    token: "lr_mailonly",
    notes: [{ id: "n1", text: "kept", at: 1, status: "open", reason: null, replies: [] }],
    updatedAt: 1,
  };
  await store.commit({
    expectedVersion: before.version,
    stateJson: "{\"replaced\":true}",
    publicDoor: { locked: false, knocking: true },
    mail: [{ ownerKey: box.ownerKey, data: box, tokenHash: "mailonly-hash", dropHashes: [] }],
    agentIds: [],
    roomChanged: false,
  });
  const after = await store.read(null);
  assert.equal(after.version, before.version);
  assert.equal(after.raw, before.raw);
  const loaded = await store.loadOwner(box.ownerKey);
  assert.equal(loaded?.notes[0]?.text, "kept");
}

async function expectConflict(store: RoomPersistence, arm: (on: boolean) => void) {
  const room = await ownedRoom(store);
  const ada = await admit(room, { name: "Ada", emoji: "🌿", color: "#88aa66", ip: "ada" });
  assert.equal(admitted(ada), true);
  assert.equal(ada.ok, true);
  if (!ada.ok) return;
  const bea = await admit(room, { name: "Bea", emoji: "🍀", color: "#668855", ip: "bea" });
  assert.equal(admitted(bea), true);
  assert.equal(bea.ok, true);
  if (!bea.ok) return;
  const before = (await store.read(null)).version;
  arm(true);
  const [first, second] = await Promise.all([
    room.act(ada.token, { action: "say", message: "alpha" }),
    room.act(bea.token, { action: "say", message: "beta" }),
  ]);
  arm(false);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const saved = await store.read(null);
  const texts = eventsOf(saved.raw).map((event) => event.text ?? "");
  assert.equal(texts.filter((text) => text.includes("alpha")).length, 1);
  assert.equal(texts.filter((text) => text.includes("beta")).length, 1);
  assert.equal(saved.version, before + 2);
}

async function expectNotes(store: RoomPersistence, arm: (on: boolean) => void) {
  const room = await ownedRoom(store);
  const nia = await admit(room, { name: "Nia", emoji: "🌿", color: "#3d8b6e", ip: "nia-notes" });
  assert.equal(admitted(nia), true);
  assert.equal(nia.ok, true);
  if (!nia.ok) return;
  arm(true);
  const [alpha, beta] = await Promise.all([
    room.postNote(nia.ownerKey, "note-alpha"),
    room.postNote(nia.ownerKey, "note-beta"),
  ]);
  arm(false);
  assert.equal(alpha.ok, true);
  assert.equal(beta.ok, true);
  const looked = await room.look(nia.token);
  assert.equal(looked.ok, true);
  if (!looked.ok || !("notes" in looked)) return;
  const texts = looked.notes.map((note) => note.text);
  assert.equal(texts.filter((text) => text === "note-alpha").length, 1);
  assert.equal(texts.filter((text) => text === "note-beta").length, 1);
}

/** Three simulated minutes of looks, 20s apart. The real idle limit stays 90s. */
async function expectPresence(store: RoomPersistence) {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    const room = await ownedRoom(store);
    const pip = await admit(room, { name: "Pip", emoji: "🌿", color: "#c4a574", ip: "pip-presence" });
    assert.equal(admitted(pip), true);
    assert.equal(pip.ok, true);
    if (!pip.ok) return;
    const start = now;
    for (let step = 0; step <= 9; step += 1) {
      now = start + step * 20_000;
      const looked = await room.look(pip.token);
      assert.equal(looked.ok, true);
      if (looked.ok && "you" in looked) assert.equal(looked.you.name, "Pip");
    }
    now = start + 180_000;
    const said = await room.act(pip.token, { action: "say", message: "still here" });
    assert.equal(said.ok, true);
    const saved = await store.read(null);
    const texts = eventsOf(saved.raw).map((event) => event.text ?? "");
    assert.equal(texts.some((text) => text.includes("Pip slipped out")), false);
    assert.equal(texts.some((text) => text.includes("still here")), true);
  } finally {
    Date.now = realNow;
  }
}

/** v21: an apartment's public snapshot never carries invites, the trusted list or the owner identity. No rescue claim, no knocks. */
function testPublicDoor() {
  const engine = new RoomEngine();
  engine.setOwnerIdentity(OWNER, { seeds: false });
  const stranger = engine.register({ name: "Moss", emoji: "🌿", ip: "moss" });
  assert.equal(stranger.ok, false, "no invite, no entry (and no rescue claim)");
  assert.equal(!stranger.ok && stranger.code, "invite_missing");
  const minted = engine.doorAct(OWNER, "invite");
  assert.equal(minted.ok, true);
  const code = minted.ok && "invite" in minted ? String(minted.invite) : "";
  const fern = engine.register({ name: "Fern", emoji: "🌿", ip: "fern", invite: `${code}.` });
  assert.equal(admitted(fern), true, "trailing full stop tolerated");
  const reuse = engine.register({ name: "Fen", emoji: "🌿", ip: "fen", invite: code });
  assert.equal(!reuse.ok && reuse.code, "invite_used");
  const snap = engine.snapshot();
  assert.deepEqual(snap.door, { locked: true, knocking: false });
  const packed = JSON.stringify(snap);
  assert.equal(packed.includes(code), false);
  assert.equal(packed.includes("trusted"), false);
  assert.equal(packed.includes("acct_"), false);
  assert.equal(engine.door.trusted.some((p) => p.name === "Poppy" || p.name === "Tester"), false, "new apartments have no seed agents");
  assert.equal(engine.doorBrief("own_" + "0".repeat(36)), null, "an agent key never opens the owner door");
}

async function testRpcClient() {
  const original = globalThis.fetch;
  const logged: unknown[][] = [];
  const errorLog = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), "sb_secret_test");
      assert.equal(headers.get("authorization"), null);
      assert.ok(init?.signal);
      return new Response(JSON.stringify({ version: 1, unchanged: true, presence: [] }), { status: 200 });
    }) as typeof fetch;
    const secretStore = new SupabaseStore(supabaseRpc("http://example.test", "sb_secret_test"), "11111111-1111-4111-8111-111111111111");
    const read = await secretStore.read(1);
    assert.equal(read.unchanged, true);

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), "eyJabc");
      assert.equal(headers.get("authorization"), "Bearer eyJabc");
      return new Response(JSON.stringify({ message: "nope", code: "42501" }), { status: 401 });
    }) as typeof fetch;
    await assert.rejects(() => new SupabaseStore(supabaseRpc("http://example.test", "eyJabc"), "11111111-1111-4111-8111-111111111111").read(1), RoomUnavailable);
    const flat = JSON.stringify(logged);
    assert.equal(flat.includes("sb_secret_test"), false);
    assert.equal(flat.includes("eyJabc"), false);
    assert.equal(flat.includes("nope"), true);
  } finally {
    globalThis.fetch = original;
    console.error = errorLog;
  }
}

function testOffline() {
  const saved = {
    vercel: process.env.VERCEL_ENV,
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    role: process.env.SUPABASE_SERVICE_ROLE_KEY,
    upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
    upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  process.env.VERCEL_ENV = "production";
  try {
    assert.throws(() => getEngine(), RoomOffline);
    // v21: production never falls back to an in-process apartment directory.
    assert.throws(() => directoryNow(), /Supabase is required in production/);
    const response = roomFailure(new RoomOffline());
    assert.equal(response?.status, 503);
    assert.equal(response?.headers.get("Retry-After"), "2");
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("VERCEL_ENV", saved.vercel);
    restore("SUPABASE_URL", saved.url);
    restore("SUPABASE_SECRET_KEY", saved.secret);
    restore("SUPABASE_SERVICE_ROLE_KEY", saved.role);
    restore("UPSTASH_REDIS_REST_URL", saved.upstashUrl);
    restore("UPSTASH_REDIS_REST_TOKEN", saved.upstashToken);
    restore("KV_REST_API_URL", saved.kvUrl);
    restore("KV_REST_API_TOKEN", saved.kvToken);
  }
}

function livingIds(raw: string | null) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as { agents?: { id?: string }[] };
    return (data.agents ?? []).map((agent) => agent.id).filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

/** v19+: no knock / admit. An invited agent re-registering with its ownerKey (guest pass) gets a fresh token; the stale one is dropped. */
async function expectAdmitRotates(store: RoomPersistence) {
  const room = await ownedRoom(store);
  const fern = await admit(room, { name: "Fern", emoji: "🌿", color: "#c4a574", ip: "fern-admit" });
  assert.equal(admitted(fern), true);
  if (!fern.ok || !("token" in fern)) return assert.fail("fern admitted");
  const left = await room.leave(fern.token);
  assert.equal(left.ok, true);
  const back = await room.register({ name: "Fern", emoji: "🌿", color: "#c4a574", ip: "fern-admit", ownerKey: fern.ownerKey });
  assert.equal(admitted(back), true, "guest pass re-entry");
  if (!back.ok || !("token" in back)) return;
  assert.equal((await store.loadToken(back.token))?.ownerKey, fern.ownerKey);
  void livingIds;
}

function presenceRows(seen: [string, number][]) {
  return seen.map(([agent_id, seen_ms]) => ({ agent_id, seen_ms }));
}

async function memRpc(mem: MemoryPersist, fn: string, args: Record<string, unknown>) {
  if (fn === "room_read") {
    const known = args.p_known_version == null ? null : Number(args.p_known_version);
    const snap = await mem.read(known);
    const presence = presenceRows(snap.seen);
    if (snap.unchanged) return { version: snap.version, unchanged: true, presence };
    return { version: snap.version, unchanged: false, state_gz: snap.raw ? encodeState(snap.raw) : null, presence };
  }
  if (fn === "room_commit") {
    const mail = Array.isArray(args.p_mail) ? args.p_mail : [];
    const commit: RoomCommit = {
      expectedVersion: Number(args.p_expected),
      stateJson: typeof args.p_state === "string" && args.p_state ? decodeState(args.p_state) : "",
      publicDoor: (args.p_public_door ?? { locked: true, knocking: false }) as RoomCommit["publicDoor"],
      mail: mail.map((item) => {
        const row = item as { owner_key: string; data: Mailbox; token_hash: string; drop_hashes: string[] };
        return { ownerKey: row.owner_key, data: row.data, tokenHash: row.token_hash ?? "", dropHashes: row.drop_hashes ?? [] };
      }),
      agentIds: Array.isArray(args.p_agent_ids) ? (args.p_agent_ids as string[]) : [],
      roomChanged: args.p_room_changed !== false,
    };
    return mem.commit(commit);
  }
  if (fn === "rate_hit") {
    const hit = await mem.rateHit(String(args.p_key), Number(args.p_limit), Number(args.p_window_ms));
    return { limited: hit.limited, retry_after_ms: hit.retryAfterMs };
  }
  if (fn === "presence_touch") {
    await mem.touchPresence(String(args.p_agent_id), Number(args.p_seen_ms));
    return null;
  }
  if (fn === "mail_owner") return mem.loadOwner(String(args.p_owner_key ?? ""));
  if (fn === "kv_get" || fn === "kv_put" || fn === "mail_token") return null;
  throw new Error(`unexpected rpc ${fn}`);
}

function jsonReq(path: string, body: unknown, ip: string) {
  return new Request(`http://room.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function testNoteRoute() {
  const saved = { store: process.env.ROOM_STORE, vercel: process.env.VERCEL_ENV };
  const origFetch = globalThis.fetch;
  delete process.env.VERCEL_ENV;
  process.env.ROOM_STORE = "memory";
  resetRedisCalls();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    throw new Error(`unexpected fetch ${String(input).slice(0, 40)}`);
  }) as typeof fetch;
  try {
    const { directory } = await import("../lib/apartments/directory");
    const { freshApartmentState, roomFor } = await import("../lib/apartments/resolve");
    const { accountIdentity } = await import("../lib/apartments/identity");
    const { POST: register } = await import("../app/api/register/route");
    const { GET, POST } = await import("../app/api/note/route");
    const identity = accountIdentity("user-note-test");
    const made = await directory().create("user-note-test", freshApartmentState(identity), { locked: true, knocking: false });
    const minted = await roomFor(made.id).doorAct(identity, "invite");
    assert.equal(minted.ok, true);
    const invite = minted.ok && "invite" in minted ? String(minted.invite) : "";
    const refused = await register(jsonReq("/api/register", { name: "Fern", emoji: "🌿", color: "#c4a574" }, "10.8.0.9"));
    assert.equal(refused.status, 403, "no invite, no apartment");
    const joined = await register(jsonReq("/api/register", { name: "Fern", emoji: "🌿", color: "#c4a574", invite: `  ${invite}. ` }, "10.8.0.1"));
    assert.equal(joined.status, 201);
    const created = (await joined.json()) as { ownerKey?: string; token?: string };
    const ownerKey = created.ownerKey ?? "";
    assert.match(ownerKey, /^own_[0-9a-f]{36}$/);
    const page = await GET(new Request(`http://room.test/api/note?ownerKey=${encodeURIComponent(ownerKey)}`, { headers: { "x-forwarded-for": "10.8.0.2" } }));
    assert.equal(page.status, 200, "owner notes");
    const listed = (await page.json()) as { ok?: boolean; name?: string };
    assert.equal(listed.ok, true);
    assert.equal(listed.name, "Fern");
    const posted = await POST(jsonReq("/api/note", { ownerKey, message: "Water the plant." }, "10.8.0.3"));
    assert.equal(posted.status, 200);
    const again = await GET(new Request(`http://room.test/api/note?ownerKey=${encodeURIComponent(ownerKey)}`, { headers: { "x-forwarded-for": "10.8.0.4" } }));
    assert.equal(again.status, 200);
    const round = (await again.json()) as { notes?: { text?: string }[] };
    assert.equal(round.notes?.some((note) => note.text === "Water the plant."), true);
    await flushMail();
    await loadOwner(ownerKey);
    await loadToken(created.token ?? "");
    assert.deepEqual(redisCallCounts(), {});
  } finally {
    globalThis.fetch = origFetch;
    if (saved.store === undefined) delete process.env.ROOM_STORE;
    else process.env.ROOM_STORE = saved.store;
    if (saved.vercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = saved.vercel;
  }
}

async function testMemory() {
  const mem = new MemoryPersist();
  const barrier = makeBarrier();
  mem.beforeCommit = () => barrier.wait();
  assert.equal(decodeState(encodeState('{"ok":true}')), '{"ok":true}');
  await expectSeed(mem);
  await expectMailOnly(mem);
  await expectConflict(mem, (on) => barrier.arm(on));

  const notes = new MemoryPersist();
  const noteBarrier = makeBarrier();
  notes.beforeCommit = () => noteBarrier.wait();
  await expectSeed(notes);
  await expectNotes(notes, (on) => noteBarrier.arm(on));

  const quiet = new MemoryPersist();
  await expectPresence(quiet);
  await expectAdmitRotates(new MemoryPersist());
}

function psql(sql: string) {
  return execFileSync("sudo", ["-u", "postgres", "psql", "-d", "living_room", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

function psqlFails(sql: string) {
  try {
    execFileSync("sudo", ["-u", "postgres", "psql", "-d", "living_room", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return false;
  } catch {
    return true;
  }
}

function prepareLocalRoles() {
  psql(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      else
        alter role service_role bypassrls;
      end if;
    end $$;
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all routines in schema public to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on routines to anon, authenticated, service_role;
  `);
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", "living_room", "-v", "ON_ERROR_STOP=1", "-f", "supabase/migrations/0001_init.sql"],
    { encoding: "utf8", stdio: "pipe" },
  );
  psql(
    "grant execute on function room_commit(bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint) to public, anon, authenticated",
  );
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", "living_room", "-v", "ON_ERROR_STOP=1", "-f", "supabase/migrations/0002_mail_lock.sql"],
    { encoding: "utf8", stdio: "pipe" },
  );
  const commitDef = psql(
    "select pg_get_functiondef('public.room_commit(bigint,text,jsonb,jsonb,text[],boolean,text,jsonb,smallint)'::regprocedure)",
  );
  assert.match(commitDef, /for update/i);
  assert.match(commitDef, /raise warning/i);
  assert.equal(psql("select has_function_privilege('anon','public.room_read(bigint)','execute')"), "f");
  assert.equal(
    psql("select has_function_privilege('anon','public.room_commit(bigint,text,jsonb,jsonb,text[],boolean,text,jsonb,smallint)','execute')"),
    "f",
  );
  assert.equal(psql("select has_function_privilege('authenticated','public.room_read(bigint)','execute')"), "f");
  assert.equal(psql("select has_function_privilege('anon','public.room_commit(bigint,text,jsonb,jsonb,text[],boolean,text,jsonb,smallint)','execute')"), "f");
  assert.equal(psql("select has_table_privilege('anon','public.room','select')"), "f");
  assert.equal(psqlFails("set role anon; select public.room_read(null::bigint);"), true);
  assert.equal(psqlFails("set role anon; select * from public.room;"), true);
  psql(`
    alter role living bypassrls;
    grant all on all tables in schema public to living;
    grant execute on all functions in schema public to living;
  `);
}

function psqlFile(file: string) {
  execFileSync("sudo", ["-u", "postgres", "psql", "-d", "living_room", "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { encoding: "utf8", stdio: "pipe" });
}

const CASTS: Record<string, string> = {
  p_known_version: "bigint", p_expected: "bigint", p_state: "text", p_public_door: "jsonb", p_mail: "jsonb",
  p_agent_ids: "text[]", p_room_changed: "boolean", p_idem_key: "text", p_idem_response: "jsonb", p_idem_status: "smallint",
  p_key: "text", p_limit: "int", p_window_ms: "int", p_agent_id: "text", p_seen_ms: "bigint", p_owner_key: "text",
  p_token_hash: "text", p_value: "jsonb", p_ttl_seconds: "int", p_apartment: "uuid", p_invites: "jsonb", p_user: "uuid",
  p_hash: "text", p_exp_ms: "bigint", p_max_unused: "int", p_session_hash: "text", p_session_ms: "bigint", p_sessions: "boolean",
  p_refresh: "boolean",
};

/**
 * v21 on a local Postgres (DATABASE_URL): the production v20 schema (0001 + 0002, privilege checks kept),
 * then the TEST namespace 0005 (v21_test, public.v21t_apt_*) and the PRODUCTION migration 0006 (v21,
 * public.apt_*) with its legacy import, each applied fresh (down, then up). Nothing here touches Supabase.
 */
async function testPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("postgres skipped");
    return;
  }
  prepareLocalRoles();
  psql("create schema if not exists auth; create table if not exists auth.users (id uuid primary key, email text); grant usage on schema auth to living; grant all on auth.users to living;");
  psqlFile("supabase/migrations/0005_v21_test_apartments_down.sql");
  psqlFile("supabase/migrations/0005_v21_test_apartments.sql");
  psql("grant usage on schema v21_test to living; grant all on all tables in schema v21_test to living;");
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  // Calls run as service_role, the only role the v21 functions are granted to (like PostgREST with the secret key).
  psql("grant service_role to living; grant usage on schema auth to service_role; grant all on auth.users to service_role;");
  await client.query("set role service_role");
  let waitCommit: () => Promise<void> = async () => {};
  const rpcFor = (prefix: string) => async (fn: string, args: Record<string, unknown>) => {
    if (fn === "room_commit") await waitCommit();
    const keys = Object.keys(args);
    const rendered = keys.map((key, index) => `${key} => $${index + 1}::${CASTS[key] ?? "text"}`).join(", ");
    const values = keys.map((key) => {
      const value = args[key];
      if (value == null) return null;
      if (CASTS[key] === "jsonb") return JSON.stringify(value);
      return value;
    });
    const { rows } = await client.query(`select public.${prefix}apt_${fn}(${rendered}) as result`, values);
    return rows[0]?.result ?? null;
  };
  const call = rpcFor("v21t_");
  const user = async () => {
    const { rows } = await client.query("insert into auth.users (id, email) values (gen_random_uuid(), 'x@example.com') returning id");
    return String(rows[0].id);
  };

  // --- one account, one apartment; one apartment, one owner (unique owner_id)
  const a = await user();
  const b = await user();
  const seedEngine = new RoomEngine();
  seedEngine.setOwnerIdentity(OWNER, { seeds: false });
  const freshState = encodeState(JSON.stringify(seedEngine.serialize()));
  const first = (await call("create", { p_user: a, p_state: freshState, p_public_door: null })) as { id: string; created: boolean };
  const again = (await call("create", { p_user: a, p_state: encodeState("{}"), p_public_door: null })) as { id: string; created: boolean };
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.equal(again.id, first.id, "a second create returns the same apartment");
  const [r1, r2] = await Promise.all([
    call("create", { p_user: b, p_state: freshState, p_public_door: null }),
    call("create", { p_user: b, p_state: freshState, p_public_door: null }),
  ]);
  assert.equal((r1 as { id: string }).id, (r2 as { id: string }).id, "racing creates converge");
  assert.notEqual((r1 as { id: string }).id, first.id, "two accounts get two apartments");
  assert.equal(psqlFails(`update v21_test.apartments set owner_id = '${a}' where id = '${(r1 as { id: string }).id}'`), true, "unique owner_id");
  assert.equal(psql("select count(*) from v21_test.apartments where owner_id is not null"), "2");
  assert.equal(psqlFails("set role anon; select public.v21t_apt_for_user(gen_random_uuid());"), true);
  assert.equal(psqlFails("set role authenticated; select public.v21t_apt_room_read(gen_random_uuid(), null);"), true);
  assert.equal(psqlFails("set role authenticated; select * from v21_test.apartments;"), true);

  // --- the shared store expectations, per apartment
  const store = new SupabaseStore(call, first.id);
  const barrier = makeBarrier();
  waitCommit = () => barrier.wait();
  await expectMailOnly(store);
  await expectConflict(store, (on) => barrier.arm(on));
  const noteBarrier = makeBarrier();
  waitCommit = () => noteBarrier.wait();
  await expectNotes(store, (on) => noteBarrier.arm(on));
  waitCommit = async () => {};
  await expectPresence(store);
  const other = new SupabaseStore(call, (r1 as { id: string }).id);
  const hit = await store.rateHit("look:test", 1, 60_000);
  const hitAgain = await store.rateHit("look:test", 1, 60_000);
  const otherHit = await other.rateHit("look:test", 1, 60_000);
  assert.equal(hit.limited, false);
  assert.equal(hitAgain.limited, true);
  assert.equal(otherHit.limited, false, "rate limits are per apartment");
  const otherRead = await other.read(null);
  const mineRead = await store.read(null);
  assert.notEqual(otherRead.raw, mineRead.raw, "rooms are per apartment");

  // --- invites index and agent lookup name the right apartment
  const invRow = await client.query("select count(*)::int as n from v21_test.invites where apartment_id = $1", [first.id]);
  assert.ok(invRow.rows[0].n >= 2, "minted invites are indexed (hash only)");
  const anyTok = await client.query("select token_hash from v21_test.agent_tokens where apartment_id = $1 limit 1", [first.id]);
  assert.equal(await call("agent_lookup", { p_token_hash: anyTok.rows[0].token_hash, p_owner_key: null }), first.id);

  // --- watch codes: single use, 1 minute, sessions expire
  const wh = "a".repeat(64);
  await call("watch_mint", { p_apartment: first.id, p_hash: wh, p_exp_ms: Date.now() + 60_000, p_max_unused: 3 });
  const ok = (await call("watch_redeem", { p_hash: wh, p_session_hash: "b".repeat(64), p_session_ms: 1500 })) as { ok: boolean; apartment: string };
  assert.equal(ok.ok, true);
  assert.equal(ok.apartment, first.id);
  assert.equal(((await call("watch_redeem", { p_hash: wh, p_session_hash: "c".repeat(64), p_session_ms: 1500 })) as { code: string }).code, "watch_used");
  assert.equal(await call("watch_session", { p_session_hash: "b".repeat(64) }), first.id);
  const old = "d".repeat(64);
  await call("watch_mint", { p_apartment: first.id, p_hash: old, p_exp_ms: Date.now() - 1, p_max_unused: 3 });
  assert.equal(((await call("watch_redeem", { p_hash: old, p_session_hash: "e".repeat(64), p_session_ms: 1500 })) as { code: string }).code, "watch_expired");
  await new Promise((resolve) => setTimeout(resolve, 1700));
  assert.equal(await call("watch_session", { p_session_hash: "b".repeat(64) }), null, "watch session expires");

  // --- legacy claim on the test namespace: first caller only, never someone who already has one
  const legacyId = psql("insert into v21_test.apartments (owner_id, legacy) values (null, true) returning id").split("\n")[0];
  psql(`insert into v21_test.room (apartment_id, version, state_gz) values ('${legacyId}', 7, '${encodeState('{"legacy":true}')}')`);
  assert.equal(await call("claim_legacy", { p_user: a }), null, "an account with an apartment can't claim");
  const c = await user();
  const d = await user();
  const claimed = (await call("claim_legacy", { p_user: c })) as { id: string; legacy: boolean };
  assert.equal(claimed.id, legacyId);
  assert.equal(await call("claim_legacy", { p_user: d }), null, "only the first claim wins");
  assert.equal(((await call("for_user", { p_user: c })) as { id: string }).id, legacyId);
  const legacyRead = await new SupabaseStore(call, legacyId).read(null);
  assert.equal(legacyRead.version, 7);
  assert.equal(legacyRead.raw, '{"legacy":true}', "the claimed room keeps its state");

  // --- PRODUCTION 0006 on the v20 tables: additive, copies (never moves) the v20 room
  const v20State = '{"v20":"room","agents":[]}';
  await client.query("insert into public.room (id, version, state_gz) values (1, 41, $1) on conflict (id) do update set version = 41, state_gz = excluded.state_gz", [encodeState(v20State)]);
  await client.query("insert into public.mailboxes (owner_key, data, expires_at) values ('own_legacyagent', '{\"ownerKey\":\"own_legacyagent\",\"agentId\":\"agt_l\",\"name\":\"Lee\",\"token\":\"\",\"notes\":[],\"updatedAt\":1}', now() + interval '1 day') on conflict (owner_key) do nothing");
  await client.query("insert into public.agent_tokens (token_hash, owner_key, expires_at) values ($1, 'own_legacyagent', now() + interval '1 day') on conflict do nothing", ["f".repeat(64)]);
  const fingerprint = () => psql("select md5(string_agg(t, '|' order by t)) from (select 'room:'||version||':'||md5(state_gz) as t from public.room union all select 'mail:'||owner_key from public.mailboxes union all select 'tok:'||token_hash from public.agent_tokens) x");
  const before = fingerprint();
  psqlFile("supabase/migrations/0006_v21_apartments_down.sql");
  psqlFile("supabase/migrations/0006_v21_apartments.sql");
  psql("grant usage on schema v21 to living; grant all on all tables in schema v21 to living;");
  assert.equal(fingerprint(), before, "0006 leaves the v20 tables untouched");
  const prod = rpcFor("");
  const legacy = psql("select id from v21.apartments where legacy and owner_id is null");
  assert.match(legacy, /^[0-9a-f-]{36}$/, "0006 created the legacy apartment");
  const copied = await new SupabaseStore(prod, legacy).read(null);
  assert.equal(copied.raw, v20State, "0006 copied the v20 room state");
  assert.equal(copied.version, 41);
  assert.equal(await prod("agent_lookup", { p_token_hash: "f".repeat(64), p_owner_key: null }), legacy, "v20 agent tokens still find the room");
  // refresh before any v21 write picks up late v20 activity; after a v21 write it refuses
  await client.query("update public.room set version = 42, state_gz = $1 where id = 1", [encodeState('{"v20":"later"}')]);
  const refreshed = (await prod("import_legacy", { p_refresh: true })) as { ok: boolean };
  assert.equal(refreshed.ok, true);
  assert.equal((await new SupabaseStore(prod, legacy).read(null)).raw, '{"v20":"later"}');
  psql(`update v21.room set version = version + 1 where apartment_id = '${legacy}'`);
  const refused = (await prod("import_legacy", { p_refresh: true })) as { ok: boolean; reason?: string };
  assert.equal(refused.ok, false, "no refresh over v21 writes");
  const founder = await user();
  const got = (await prod("claim_legacy", { p_user: founder })) as { id: string };
  assert.equal(got.id, legacy, "LEGACY_OWNER_EMAIL account claims the v20 room");
  const fresh = await user();
  const made = (await prod("create", { p_user: fresh, p_state: encodeState("{}"), p_public_door: null })) as { id: string; created: boolean };
  assert.equal(made.created, true);
  assert.notEqual(made.id, legacy, "any other account gets a fresh apartment");
  assert.equal(psqlFails("set role anon; select public.apt_room_read(gen_random_uuid(), null);"), true);
  assert.equal(psqlFails("set role anon; select public.apt_import_legacy(false);"), true);
  // down leaves v20 intact
  psqlFile("supabase/migrations/0006_v21_apartments_down.sql");
  assert.equal(psql("select count(*) from pg_namespace where nspname = 'v21'"), "0");
  assert.equal(psql("select version from public.room where id = 1"), "42");
  assert.equal(psql("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'apt\\_%'"), "0");
  const round = decodeState(encodeState('{"ok":true}'));
  assert.equal(round, '{"ok":true}');
  await client.end();
  console.log("postgres ok (0001/0002 v20 checks, 0005 v21_test, 0006 production + legacy import + down)");
}

async function main() {
  testPublicDoor();
  await testRpcClient();
  testOffline();
  await testMemory();
  await testPostgres();
  await testNoteRoute();
  const offlineBody = await roomFailure(new RoomOffline())?.json();
  assert.equal(offlineBody?.error, "room offline");
  console.log("store-check ok");
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : "store-check failed");
    process.exit(1);
  },
);
