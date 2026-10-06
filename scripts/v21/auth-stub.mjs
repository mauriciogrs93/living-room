// Local stand-in for Supabase Auth. No email is sent. The Next server points SUPABASE_URL here
// (ROOM_STORE=memory). Not used in production. Prints nothing about users, codes, passwords or tokens.
//   node scripts/v21/auth-stub.mjs
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer as createHttp } from "node:http";

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function userId(email) {
  const h = createHash("sha256").update(`lr-stub|${email}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function hashPassword(password) {
  return createHash("sha256").update(String(password)).digest("hex");
}
function sameHash(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
function fakeJwt(sub, ttl) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + ttl, role: "authenticated" }));
  return `${head}.${body}.${b64u(randomBytes(16))}`;
}
function challengeOf(verifier) {
  return b64u(createHash("sha256").update(String(verifier)).digest());
}

const SERVICE = process.env.SUPABASE_SECRET_KEY || "sb_secret_local_stub";
const usersByEmail = new Map();
const usersById = new Map();
const sessions = new Map(); // access token -> { user, refresh }
const byRefresh = new Map(); // refresh -> access
const codes = new Map(); // auth code -> { challenge, email }
const latestCode = new Map(); // email -> code

function confirmOn() {
  return process.env.CONFIRM_EMAIL === "1";
}
function accessTtl() {
  const n = Number(process.env.STUB_ACCESS_TTL || 3600);
  return Number.isFinite(n) && n > 0 ? n : 3600;
}
function userFor(email, { create = true } = {}) {
  const key = String(email || "").trim().toLowerCase();
  let user = usersByEmail.get(key);
  if (!user && create) {
    user = {
      id: userId(key),
      email: key,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: {},
      passwordHash: null,
    };
    usersByEmail.set(key, user);
    usersById.set(user.id, user);
  }
  return user || null;
}
function publicUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    app_metadata: { ...(user.app_metadata || {}) },
    user_metadata: {},
    created_at: user.email_confirmed_at || new Date().toISOString(),
  };
}
function sessionFor(user) {
  const ttl = accessTtl();
  const access = fakeJwt(user.id, ttl);
  const refresh = b64u(randomBytes(18));
  sessions.set(access, { user, refresh });
  byRefresh.set(refresh, access);
  return {
    access_token: access,
    token_type: "bearer",
    expires_in: ttl,
    expires_at: Math.floor(Date.now() / 1000) + ttl,
    refresh_token: refresh,
    user: publicUser(user),
  };
}
function dropAccess(access) {
  const row = sessions.get(access);
  if (!row) return;
  sessions.delete(access);
  byRefresh.delete(row.refresh);
}
function bearer(req) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}
function isService(req) {
  const token = bearer(req);
  const api = String(req.headers.apikey || "");
  return token === SERVICE || api === SERVICE;
}
function invalidCredentials(send) {
  return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

const port = Number(process.env.AUTH_STUB_PORT || 4599);
const server = createHttp(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const send = (status, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "content-length": Buffer.byteLength(body) });
    res.end(body);
  };
  if (req.method === "GET" && url.pathname === "/stub/code") {
    const email = (url.searchParams.get("email") || "").toLowerCase();
    const code = latestCode.get(email) || "";
    return send(code ? 200 : 404, { code });
  }
  if (req.method === "POST" && url.pathname === "/auth/v1/otp") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || typeof body.code_challenge !== "string") return send(400, { code: 400, error_code: "validation_failed", msg: "email and code_challenge required" });
    const code = b64u(randomBytes(18));
    codes.set(code, { challenge: body.code_challenge, email });
    latestCode.set(email, code);
    userFor(email);
    return send(200, {});
  }
  if (req.method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
    const body = await readBody(req);
    const entry = codes.get(String(body.auth_code || ""));
    if (!entry) return send(404, { code: 404, error_code: "flow_state_not_found", msg: "invalid flow state" });
    if (challengeOf(body.code_verifier) !== entry.challenge) return send(400, { code: 400, error_code: "bad_code_verifier", msg: "code challenge does not match previously saved code verifier" });
    codes.delete(String(body.auth_code));
    return send(200, sessionFor(userFor(entry.email)));
  }
  if (req.method === "POST" && url.pathname === "/auth/v1/signup") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return send(400, { code: 400, error_code: "validation_failed", msg: "email and password required" });
    if (usersByEmail.has(email)) return send(422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    const user = userFor(email);
    user.passwordHash = hashPassword(password);
    user.email_confirmed_at = confirmOn() ? null : new Date().toISOString();
    if (confirmOn()) return send(200, publicUser(user));
    return send(200, sessionFor(user));
  }
  if (req.method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const user = userFor(email, { create: false });
    if (!user || !user.passwordHash || !user.email_confirmed_at || !sameHash(user.passwordHash, hashPassword(password))) return invalidCredentials(send);
    return send(200, sessionFor(user));
  }
  if (req.method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const body = await readBody(req);
    const access = byRefresh.get(String(body.refresh_token || ""));
    const row = access ? sessions.get(access) : null;
    if (!row) return send(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    dropAccess(access);
    return send(200, sessionFor(row.user));
  }
  if (req.method === "GET" && url.pathname === "/auth/v1/user") {
    const row = sessions.get(bearer(req));
    if (!row) return send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(200, publicUser(row.user));
  }
  if (req.method === "PUT" && url.pathname === "/auth/v1/user") {
    const row = sessions.get(bearer(req));
    if (!row) return send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    const body = await readBody(req);
    if (typeof body.password === "string" && body.password) row.user.passwordHash = hashPassword(body.password);
    return send(200, publicUser(row.user));
  }
  if (req.method === "POST" && url.pathname === "/auth/v1/logout") {
    const token = bearer(req);
    const row = sessions.get(token);
    if (!row) return send(204, {});
    const scope = url.searchParams.get("scope") || "global";
    if (scope === "local") dropAccess(token);
    else if (scope === "others") {
      for (const [access, item] of [...sessions]) if (item.user.id === row.user.id && access !== token) dropAccess(access);
    } else {
      for (const [access, item] of [...sessions]) if (item.user.id === row.user.id) dropAccess(access);
    }
    res.writeHead(204, { "cache-control": "no-store" });
    return res.end();
  }
  const adminUser = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/i);
  if (adminUser && !isService(req)) return send(401, { code: 401, error_code: "no_authorization", msg: "This endpoint requires a valid Bearer token" });
  if (req.method === "PUT" && adminUser) {
    const user = usersById.get(adminUser[1]);
    if (!user) return send(404, { code: 404, error_code: "user_not_found", msg: "User not found" });
    const body = await readBody(req);
    if (body.app_metadata && typeof body.app_metadata === "object") user.app_metadata = { ...user.app_metadata, ...body.app_metadata };
    if (body.email_confirm === true) user.email_confirmed_at = user.email_confirmed_at || new Date().toISOString();
    return send(200, publicUser(user));
  }
  if (req.method === "POST" && url.pathname === "/auth/v1/admin/users") {
    if (!isService(req)) return send(401, { code: 401, error_code: "no_authorization", msg: "This endpoint requires a valid Bearer token" });
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return send(400, { code: 400, error_code: "validation_failed", msg: "email required" });
    if (usersByEmail.has(email)) return send(422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
    const user = userFor(email);
    if (typeof body.password === "string" && body.password) user.passwordHash = hashPassword(body.password);
    if (body.email_confirm === true) user.email_confirmed_at = new Date().toISOString();
    return send(200, publicUser(user));
  }
  return send(404, { msg: "stub: unknown route" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`auth stub listening on 127.0.0.1:${port}`);
});
