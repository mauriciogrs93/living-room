// v21 legacy claim, end to end on the private preview (Supabase v21_test, seeded legacy room).
//   VIA=<preview url> node v21-legacy-e2e.mjs
// The seeded room stands in for the Founder's current v20 room (agents Poppy + Tester, books incl. the
// "Legacy marker c78471" book, and a pre-minted v20 invite). LEGACY_OWNER_EMAIL on the preview is
// v21t-legacy-owner@example.com. Runs once: only one legacy room exists and the claim is permanent.
import { readFileSync } from "node:fs";
import { VIA, Jar, call, check, done, signIn, nextIp, LINE_RE, uniq } from "./v21-lib.mjs";

if (!VIA) throw new Error("set VIA=<preview url>");
const legacy = JSON.parse(readFileSync("/workspace/.secrets/legacy-invite.json", "utf8"));
const LEGACY_EMAIL = "v21t-legacy-owner@example.com";
const run = uniq();
const names = (st) => (st.json?.agents || []).map((a) => a.name);
const hasMarker = (st) => (st.text || "").includes(legacy.marker);

// 1. Before anyone claims it: the room is private, but its existing agents/invites still work.
const anon = await call("GET", "/api/state");
check("before claim: stranger sees nothing (403)", anon.status === 403);
const lee = await call("POST", "/api/register", { body: { name: "Lee", emoji: "🦉", invite: ` ${legacy.code}.` } });
check("before claim: a pre-v21 invite from the legacy room still admits an agent (Lee) -> 201", lee.status === 201 && Boolean(lee.json?.token), `status ${lee.status} ${lee.json?.code ?? ""}`);
const leeLook = await call("GET", "/api/look", { token: lee.json?.token });
check("Lee's token works in the legacy room", leeLook.status === 200, `status ${leeLook.status}`);

// 2. Someone else signs in first: fresh private apartment, the legacy room is untouched.
const ipO = nextIp();
const other = await signIn(`v21t-other-${run}@example.com`, { ip: ipO });
const meO = await call("GET", "/api/me", { jar: other.jar, ip: ipO });
check("any other email -> fresh private apartment (legacy false, claimedLegacy false)", other.ok && meO.status === 200 && meO.json?.apartment?.legacy === false && meO.json?.apartment?.created === true && !meO.json?.apartment?.claimedLegacy, `${meO.status} ${JSON.stringify(meO.json?.apartment ?? meO.json?.code)}`);
const stO = await call("GET", "/api/state", { jar: other.jar, ip: ipO });
check("the other apartment has none of the legacy agents or books", stO.status === 200 && !names(stO).some((n) => ["Lee", "Poppy", "Tester"].includes(n)) && !hasMarker(stO), `agents ${names(stO).join(",") || "none"}`);

// 3. The legacy owner's first verified sign-in claims the room.
const ipL = nextIp();
const L = await signIn(LEGACY_EMAIL, { ip: ipL });
check("legacy owner signs in (verified magic link)", L.ok, `status ${L.status}`);
const meL = await call("GET", "/api/me", { jar: L.jar, ip: ipL });
check("first sign-in with LEGACY_OWNER_EMAIL claims the existing room (legacy true, claimedLegacy true, not a new one)", meL.status === 200 && meL.json?.role === "owner" && meL.json?.apartment?.legacy === true && meL.json?.apartment?.claimedLegacy === true && meL.json?.apartment?.created === false, JSON.stringify(meL.json?.apartment ?? meL.json?.code));
const stL = await call("GET", "/api/state", { jar: L.jar, ip: ipL });
// (Poppy / Tester are trusted placeholder rows on the door, not agents; see v21-legacy-after.mjs.)
check("claimed room keeps its agents (Lee, who joined before the claim)", stL.status === 200 && names(stL).includes("Lee"), `agents ${names(stL).join(",")}`);
check("claimed room keeps its state (the 'Legacy marker' book)", hasMarker(stL));
const leeAfter = await call("GET", "/api/look", { token: lee.json?.token });
check("Lee's token still works after the claim", leeAfter.status === 200, `status ${leeAfter.status}`);
const said = await call("POST", "/api/act", { token: lee.json?.token, body: { action: "say", message: `still here ${run}` } });
check("Lee can still act in the claimed room", said.status === 200, `status ${said.status}`);
const inv = await call("POST", "/api/apartment/invite", { jar: L.jar, ip: ipL, body: {} });
const m = LINE_RE.exec(inv.json?.line || "");
check("the claimed room's owner can press Invite (line + watch link)", inv.status === 200 && Boolean(m) && /#watch=/.test(inv.json?.watchLink || ""), `status ${inv.status}`);
const door = await call("GET", "/api/door", { jar: L.jar, ip: ipL });
check("the claimed room's owner sees the door", door.status === 200, `status ${door.status}`);
const otherDoor = await call("GET", "/api/door", { jar: other.jar, ip: ipO });
const otherSt2 = await call("GET", "/api/state", { jar: other.jar, ip: ipO });
check("the other account still can't see the legacy room", !hasMarker(otherDoor) && !hasMarker(otherSt2) && !names(otherSt2).includes("Lee"));

// 4. Signing in again (new session) lands in the same room; it is not claimed twice.
const L2 = await signIn(LEGACY_EMAIL, { ip: ipL });
const meL2 = await call("GET", "/api/me", { jar: L2.jar, ip: ipL });
const stL2 = await call("GET", "/api/state", { jar: L2.jar, ip: ipL });
check("second sign-in -> same legacy room, already claimed (claimedLegacy false, created false)", meL2.json?.apartment?.legacy === true && !meL2.json?.apartment?.claimedLegacy && meL2.json?.apartment?.created === false && hasMarker(stL2), JSON.stringify(meL2.json?.apartment ?? meL2.json?.code));

// 5. A stranger still sees nothing.
const anon2 = await call("GET", "/api/state", { jar: new Jar() });
check("after claim: stranger still 403", anon2.status === 403);

process.exitCode = done("v21-legacy-e2e (preview, v21_test)") ? 1 : 0;
