import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { RoomEngine } from "../lib/room/engine";
import { RoomOffline, RoomUnavailable } from "../lib/room/errors";
import { getEngine, roomFailure } from "../lib/room/access";
import { flushMail, loadOwner, loadToken, type Mailbox } from "../lib/room/mailbox";
import { ensureNews } from "../lib/room/news";
import { redisCallCounts, resetRedisCalls } from "../lib/room/redis";
import { decodeState, encodeState, hashToken } from "../lib/room/store/codec";
import { MemoryPersist } from "../lib/room/store/memory-persist";
import { SupabaseStore, supabaseRpc } from "../lib/room/store/supabase-store";
import { VersionedRoom } from "../lib/room/store/versioned-room";
import type { RoomCommit, RoomPersistence } from "../lib/room/store/persist";

function admitted(result: { ok?: boolean; waiting?: boolean }) {
  return result.ok === true && result.waiting !== true;
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
  const room = new VersionedRoom(store);
  const ada = await room.register({ name: "Ada", emoji: "🌿", color: "#88aa66", ip: "ada" });
  assert.equal(admitted(ada), true);
  assert.equal(ada.ok, true);
  if (!ada.ok) return;
  const opened = await room.doorAct(ada.ownerKey, "unlock");
  assert.equal(opened.ok, true);
  const bea = await room.register({ name: "Bea", emoji: "🍀", color: "#668855", ip: "bea" });
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
  const room = new VersionedRoom(store);
  const nia = await room.register({ name: "Nia", emoji: "🌿", color: "#3d8b6e", ip: "nia-notes" });
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
    const room = new VersionedRoom(store);
    const pip = await room.register({ name: "Pip", emoji: "🌿", color: "#c4a574", ip: "pip-presence" });
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

function testPublicDoor() {
  const engine = new RoomEngine();
  const owner = engine.register({ name: "Fern", emoji: "🌿", ip: "fern" });
  assert.equal(admitted(owner), true);
  const knock = engine.register({ name: "Moss", emoji: "🌿", ip: "moss" });
  assert.equal(knock.ok === true && "waiting" in knock && knock.waiting === true, true);
  const snap = engine.snapshot();
  assert.deepEqual(snap.door, { locked: true, knocking: true });
  const packed = JSON.stringify(snap);
  assert.equal(packed.includes("Moss"), false);
  assert.equal(packed.includes(engine.door.invite), false);
  assert.equal(packed.includes("trusted"), false);
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
    const secretStore = new SupabaseStore(supabaseRpc("http://example.test", "sb_secret_test"));
    const read = await secretStore.read(1);
    assert.equal(read.unchanged, true);

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), "eyJabc");
      assert.equal(headers.get("authorization"), "Bearer eyJabc");
      return new Response(JSON.stringify({ message: "nope", code: "42501" }), { status: 401 });
    }) as typeof fetch;
    await assert.rejects(() => new SupabaseStore(supabaseRpc("http://example.test", "eyJabc")).read(1), RoomUnavailable);
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
  process.env.VERCEL_ENV = "preview";
  try {
    assert.throws(() => getEngine(), RoomOffline);
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

async function expectAdmitRotates(store: RoomPersistence) {
  const room = new VersionedRoom(store);
  const fern = await room.register({ name: "Fern", emoji: "🌿", color: "#c4a574", ip: "fern-admit" });
  assert.equal(admitted(fern), true);
  assert.equal(fern.ok, true);
  if (!fern.ok) return;
  const moss = await room.register({ name: "Moss", emoji: "🌿", color: "#3d8b6e", note: "hello", ip: "moss-admit" });
  assert.equal(moss.ok, true);
  if (!moss.ok || !("waiting" in moss) || moss.waiting !== true || !("token" in moss)) {
    assert.fail("visitor should knock");
  }
  const snap = await store.read(null);
  const stale = `lr_${"ab".repeat(18)}`;
  const box = await store.loadOwner(moss.ownerKey);
  assert.ok(box);
  const saved: Mailbox = { ...box, token: stale };
  await store.commit({
    expectedVersion: snap.version,
    stateJson: snap.raw ?? "{}",
    publicDoor: { locked: true, knocking: true },
    mail: [{ ownerKey: saved.ownerKey, data: saved, tokenHash: hashToken(stale), dropHashes: [hashToken(moss.token)] }],
    agentIds: livingIds(snap.raw),
    roomChanged: false,
  });
  const opened = await room.doorAct(fern.ownerKey, "admit", moss.agentId);
  assert.equal(opened.ok, true);
  assert.equal((await store.loadToken(moss.token))?.ownerKey, moss.ownerKey);
  assert.equal(await store.loadToken(stale), null);
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
  const mem = new MemoryPersist();
  const saved = {
    vercel: process.env.VERCEL_ENV,
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    role: process.env.SUPABASE_SERVICE_ROLE_KEY,
    upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
    upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    kvUrl: process.env.KV_URL,
    kvRest: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
    kvRead: process.env.KV_REST_API_READ_ONLY_TOKEN,
    kvRedis: process.env.KV_REDIS_URL,
  };
  const origFetch = globalThis.fetch;
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_URL = "http://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_role";
  process.env.KV_URL = "https://kv.example";
  process.env.KV_REST_API_URL = "https://kv.example";
  process.env.KV_REST_API_TOKEN = "kv-token";
  process.env.KV_REST_API_READ_ONLY_TOKEN = "kv-ro";
  process.env.KV_REDIS_URL = "rediss://kv.example";
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
  resetRedisCalls();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("/rest/v1/rpc/")) throw new Error(`unexpected fetch ${url}`);
    const fn = url.split("/").pop() ?? "";
    const args = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const result = await memRpc(mem, fn, args);
    return new Response(JSON.stringify(result ?? null), { status: 200 });
  }) as typeof fetch;
  try {
    const { POST: register } = await import("../app/api/register/route");
    const { GET, POST } = await import("../app/api/note/route");
    const joined = await register(jsonReq("/api/register", { name: "Fern", emoji: "🌿", color: "#c4a574" }, "10.8.0.1"));
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
    const sent = (await posted.json()) as { ok?: boolean };
    assert.equal(sent.ok, true);
    const again = await GET(new Request(`http://room.test/api/note?ownerKey=${encodeURIComponent(ownerKey)}`, { headers: { "x-forwarded-for": "10.8.0.4" } }));
    assert.equal(again.status, 200);
    const round = (await again.json()) as { notes?: { text?: string }[] };
    assert.equal(round.notes?.some((note) => note.text === "Water the plant."), true);
    await flushMail();
    await loadOwner(ownerKey);
    await loadToken(created.token ?? "");
    await ensureNews();
    assert.deepEqual(redisCallCounts(), {});
  } finally {
    globalThis.fetch = origFetch;
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
    restore("KV_URL", saved.kvUrl);
    restore("KV_REST_API_URL", saved.kvRest);
    restore("KV_REST_API_TOKEN", saved.kvToken);
    restore("KV_REST_API_READ_ONLY_TOKEN", saved.kvRead);
    restore("KV_REDIS_URL", saved.kvRedis);
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

async function testPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("postgres skipped");
    return;
  }
  prepareLocalRoles();
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(
    "truncate table agent_tokens, mailboxes, presence, rate_limits, idempotency_keys, kv_cache, room",
  );
  const casts: Record<string, string> = {
    p_known_version: "bigint",
    p_expected: "bigint",
    p_state: "text",
    p_public_door: "jsonb",
    p_mail: "jsonb",
    p_agent_ids: "text[]",
    p_room_changed: "boolean",
    p_idem_key: "text",
    p_idem_response: "jsonb",
    p_idem_status: "smallint",
    p_key: "text",
    p_limit: "int",
    p_window_ms: "int",
    p_agent_id: "text",
    p_seen_ms: "bigint",
    p_owner_key: "text",
    p_token_hash: "text",
    p_value: "jsonb",
    p_ttl_seconds: "int",
  };
  let waitCommit: () => Promise<void> = async () => {};
  const call = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "room_commit") await waitCommit();
    const keys = Object.keys(args);
    const rendered = keys.map((key, index) => `${key} => $${index + 1}::${casts[key] ?? "text"}`).join(", ");
    const values = keys.map((key) => {
      const value = args[key];
      if (value == null) return null;
      if (casts[key] === "jsonb") return JSON.stringify(value);
      if (casts[key] === "boolean") return value;
      return value;
    });
    const { rows } = await client.query(`select ${fn}(${rendered}) as result`, values);
    return rows[0]?.result ?? null;
  };
  const store = new SupabaseStore(call);
  const barrier = makeBarrier();
  waitCommit = () => barrier.wait();
  await expectSeed(store);
  await expectMailOnly(store);
  await expectConflict(store, (on) => barrier.arm(on));
  const noteBarrier = makeBarrier();
  waitCommit = () => noteBarrier.wait();
  await expectNotes(store, (on) => noteBarrier.arm(on));
  waitCommit = async () => {};
  await expectPresence(store);
  const hit = await store.rateHit("look:test", 1, 60_000);
  const again = await store.rateHit("look:test", 1, 60_000);
  assert.equal(hit.limited, false);
  assert.equal(again.limited, true);
  const round = decodeState(encodeState('{"ok":true}'));
  assert.equal(round, '{"ok":true}');
  await client.end();
  console.log("postgres ok");
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "store-check failed");
  process.exitCode = 1;
});
