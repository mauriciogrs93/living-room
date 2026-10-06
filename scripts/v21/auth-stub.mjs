// Local stand-in for Supabase Auth (PKCE only). No email is sent. The Next server points SUPABASE_URL here
// (ROOM_STORE=memory). Not used in production. Prints nothing about users, codes or tokens.
//   node scripts/v21/auth-stub.mjs
import { createHash, randomBytes } from "node:crypto";
import { createServer as createHttp } from "node:http";

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function userId(email) {
  const h = createHash("sha256").update(`lr-stub|${email}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function fakeJwt(sub) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" }));
  return `${head}.${body}.${b64u(randomBytes(16))}`;
}
function challengeOf(verifier) {
  return b64u(createHash("sha256").update(String(verifier)).digest());
}

const usersByEmail = new Map();
const sessions = new Map(); // access token -> user
const codes = new Map(); // auth code -> { challenge, email }
const latestCode = new Map(); // email -> code

function userFor(email) {
  let user = usersByEmail.get(email);
  if (!user) {
    user = { id: userId(email), email, email_confirmed_at: new Date().toISOString() };
    usersByEmail.set(email, user);
  }
  return user;
}
function publicUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    app_metadata: {},
    user_metadata: {},
    created_at: user.email_confirmed_at,
  };
}
function sessionFor(user) {
  const access = fakeJwt(user.id);
  sessions.set(access, user);
  return {
    access_token: access,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: b64u(randomBytes(12)),
    user: publicUser(user),
  };
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
  if (req.method === "GET" && url.pathname === "/auth/v1/user") {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = sessions.get(token);
    if (!user) return send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(200, publicUser(user));
  }
  return send(404, { msg: "stub: unknown route" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`auth stub listening on 127.0.0.1:${port}`);
});
