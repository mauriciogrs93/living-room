/**
 * v20 door / auto-invite HTTP checks (replaces the v18 knock-door script). Prints statuses only, never keys,
 * tokens or invite codes. Local:   node scripts/door-http.mjs http://localhost:3920
 * Preview: VERCEL_DEPLOYMENT=<url> VERCEL_BIN=<vercel> OWNER_KEY_FILE=/tmp/x node scripts/door-http.mjs <url>
 * Uses at most 3 throwaway agents (Mint1, Mint2, Pass1); each leaves at the end.
 */
import { BASE, call, check, done, mint, ownerSetup, sleep, cookieFor, LINE_RE } from "./v20-http.mjs";

const ACCEPT_AT = Number(process.env.ACCEPT_AT_MS || 55_000);
const REJECT_AT = Number(process.env.REJECT_AT_MS || 65_000);
const leaveLater = [];

const owner = await ownerSetup("Owner");
check("owner session (rescue claim on a fresh room, or OWNER_KEY_FILE)", Boolean(owner.ownerKey), owner.claimed ? "claimed" : `status ${owner.status ?? "file"}`);
const { cookie } = owner;
if (owner.token) leaveLater.push(owner.token);

// --- skill.md and public spots: no placeholder, no code
const skill = await call("GET", "/skill.md");
const sk = skill.text || "";
check("skill.md has no THE_INVITE", skill.status === 200 && !sk.includes("THE_INVITE"), `status ${skill.status}`);
check("skill.md has the Writer Joining paragraph with the TTL wording", sk.includes("**Joining.** Your person gave you a line ending in \"with invite\" and a code.") && sk.includes("It works once and expires about a minute after it was made."));
check("skill.md register example sends YOUR_INVITE in the JSON body", /-d '\{[^']*"invite":"YOUR_INVITE"[^']*\}'/.test(sk) && !/[?&]invite=/.test(sk));
check("skill.md explains the 403 codes and the 24 h guest pass", ["invite_expired", "invite_used", "invite_invalid", "invite_missing", "invite_paused"].every((c) => sk.includes(c)) && /24 hours/.test(sk));
const home = await call("GET", "/", { headers: { accept: "text/html" } });
const html = home.text || "";
check("landing (non-owner) shows the private-room line", home.status === 200 && html.includes("Rooms are private. Ask the owner for an invite line."), `status ${home.status}`);
check("landing (non-owner) has no join line, code, placeholder or COPY", !/with invite|THE_INVITE|YOUR_INVITE|follow the instructions to join/.test(html) && !/>COPY</.test(html) && !/\b[a-z2-7]{26}\b(?=\.)/.test(html));

// --- non-owners can't mint
const anon = await call("POST", "/api/door", { body: { action: "invite" } });
check("mint with no owner cookie -> 403", anon.status === 403 && !anon.json?.invite, `status ${anon.status}`);
const fake = await call("POST", "/api/door", { cookie: cookieFor("own_" + "0".repeat(36)), body: { action: "invite" } });
check("mint with a wrong owner key -> 403", fake.status === 403 && !fake.json?.invite, `status ${fake.status}`);
const xsite = await call("POST", "/api/door", { cookie, body: { action: "invite" }, headers: { origin: "https://evil.example" } });
check("cross-site mint with the owner cookie -> 403", xsite.status === 403 && !xsite.json?.invite, `status ${xsite.status}`);
const getMint = await call("GET", "/api/door?action=invite", { cookie });
check("GET never mints (no invite in a GET reply)", !getMint.json?.invite && !/[a-z2-7]{26}/.test(getMint.text || ""), `status ${getMint.status}`);

// --- owner mint: a real line, no placeholder, code only in the body
const a = await mint(cookie);
const lineA = a.json?.line || "";
const mA = LINE_RE.exec(lineA);
check("owner mint -> 200 with the Writer line and a real 26-char code", a.status === 200 && Boolean(mA) && mA?.[2] === a.json?.invite, `status ${a.status}`);
check("minted line has no placeholder and no URL query", !/THE_INVITE|YOUR_INVITE|<|>/.test(lineA) && !/\?/.test(lineA) && !/invite=/.test(lineA));
check("mint reply is no-store", /no-store/.test(a.headers.get("cache-control") || ""));
const codeA = a.json?.invite || "";
const door = await call("GET", "/api/door", { cookie });
check("door view never echoes the code", door.status === 200 && !(door.text || "").includes(codeA));
const state = await call("GET", "/api/state");
check("public state never has the code", state.status === 200 && !(state.text || "").includes(codeA));
const skillQ = await call("GET", `/skill.md?invite=${codeA}`);
check("skill.md?invite= is ignored (does not echo the code)", !(skillQ.text || "").includes(codeA));
const viaQuery = await call("POST", `/api/register?invite=${codeA}`, { body: { name: "Mint1", emoji: "🔑" } });
check("invite in a URL query is ignored (403 invite_missing)", viaQuery.status === 403 && viaQuery.json?.code === "invite_missing", `${viaQuery.status} ${viaQuery.json?.code}`);

// --- expiry: mint B and C together; B at ~55 s works, C at ~65 s is invite_expired
const b = await mint(cookie);
const c = await mint(cookie);
const t0 = Date.now();
// meanwhile: A (still fresh, untouched by the query attempt) works once in the body
const inA = await call("POST", "/api/register", { body: { name: "Mint1", emoji: "🔑", invite: codeA } });
check("code in the BODY works (201) and was not used up by the query attempt", inA.status === 201 && Boolean(inA.json?.token), `${inA.status} ${inA.json?.code || ""}`);
if (inA.json?.token) leaveLater.push(inA.json.token);
const againA = await call("POST", "/api/register", { body: { name: "Mint1b", emoji: "🔑", invite: codeA } });
check("same code a second time -> 403 invite_used", againA.status === 403 && againA.json?.code === "invite_used", `${againA.status} ${againA.json?.code}`);

// guest pass: Mint1 leaves and comes back with its own ownerKey, no invite
await call("POST", "/api/leave", { token: inA.json?.token });
const back = await call("POST", "/api/register", { body: { name: "Mint1", ownerKey: inA.json?.ownerKey } });
check("used code gave a guest pass: rejoin with own ownerKey -> 201 (no invite)", back.status === 201, `${back.status} ${back.json?.code || ""}`);
if (back.json?.token) leaveLater.push(back.json.token);

await sleep(Math.max(0, t0 + ACCEPT_AT - Date.now()));
const inB = await call("POST", "/api/register", { body: { name: "Mint2", emoji: "⏱️", invite: b.json?.invite } });
const atB = Math.round((Date.now() - t0) / 1000);
check(`invite used at ~${ACCEPT_AT / 1000} s is accepted (201)`, inB.status === 201, `${inB.status} ${inB.json?.code || ""} at ${atB}s`);
if (inB.json?.token) leaveLater.push(inB.json.token);
await sleep(Math.max(0, t0 + REJECT_AT - Date.now()));
const inC = await call("POST", "/api/register", { body: { name: "Mint3", emoji: "⏱️", invite: c.json?.invite } });
const atC = Math.round((Date.now() - t0) / 1000);
check(`invite used at ~${REJECT_AT / 1000} s is rejected (403 invite_expired)`, inC.status === 403 && inC.json?.code === "invite_expired", `${inC.status} ${inC.json?.code} at ${atC}s`);

// --- mint rate limit: the window above has passed, so 10 mints succeed and the 11th is 429
const burst = [];
for (let i = 0; i < 11; i += 1) burst.push(await mint(cookie, { raw: true }));
const okCount = burst.filter((r) => r.status === 200).length;
const last = burst[10];
check("mint rate limit: 10 in a minute OK, the 11th -> 429 invite_mint_limited with Retry-After", okCount === 10 && last.status === 429 && last.json?.code === "invite_mint_limited" && Number(last.headers.get("retry-after")) > 0, burst.map((r) => r.status).join(","));
check("429 reply carries no code or line", !last.json?.invite && !last.json?.line);
const capped = await call("GET", "/api/door", { cookie });
check("unused invites never exceed 10", Number(capped.json?.unused) <= 10, `unused ${capped.json?.unused}`);

// --- pause blocks minting server-side (checked before the rate limit)
const paused = await call("POST", "/api/door", { cookie, body: { action: "pause" } });
check("pause", paused.status === 200 && paused.json?.paused === true, `status ${paused.status}`);
const whilePaused = await call("POST", "/api/door", { cookie, body: { action: "invite" } });
check("mint while paused -> 409 invites_paused, no code", whilePaused.status === 409 && whilePaused.json?.code === "invites_paused" && !whilePaused.json?.invite, `${whilePaused.status} ${whilePaused.json?.code}`);
const resumed = await call("POST", "/api/door", { cookie, body: { action: "resume" } });
check("resume", resumed.status === 200 && resumed.json?.paused === false);

// --- everyone leaves
for (const t of leaveLater) await call("POST", "/api/leave", { token: t });
const after = await call("GET", "/api/state");
const left = (after.json?.agents || []).filter((x) => /^(Mint\d|Owner)$/.test(x.name)).map((x) => x.name);
check("test agents left cleanly", left.length === 0, left.join(","));
console.log(`base ${BASE}`);
done("door-http");
