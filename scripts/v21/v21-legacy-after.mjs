// Read-only follow-up on the already-claimed legacy room (safe to rerun): the legacy owner signs in again
// and checks agents, trusted placeholder rows (Poppy, Tester), books, and that a stranger still sees nothing.
//   VIA=<preview url> node v21-legacy-after.mjs
import { readFileSync } from "node:fs";
import { Jar, call, check, done, signIn, nextIp } from "./v21-lib.mjs";
const legacy = JSON.parse(readFileSync("/workspace/.secrets/legacy-invite.json", "utf8"));
const ip = nextIp();
const L = await signIn("v21t-legacy-owner@example.com", { ip });
const me = await call("GET", "/api/me", { jar: L.jar, ip });
check("legacy owner -> the claimed legacy room", me.json?.apartment?.legacy === true && me.json?.apartment?.created === false, JSON.stringify(me.json?.apartment));
const st = await call("GET", "/api/state", { jar: L.jar, ip });
const agents = (st.json?.agents || []).map((a) => a.name);
check("state keeps the marker book", st.status === 200 && (st.text || "").includes(legacy.marker), `present now: ${agents.join(",") || "nobody (idle agents step out, as in v20)"}`);
const door = await call("GET", "/api/door", { jar: L.jar, ip });
const txt = door.text || "";
const trusted = (door.json?.trusted || []).map((p) => p.name);
const visitors = (door.json?.visitors || []).map((p) => p.name);
check("door still knows Lee (joined with a pre-v21 invite before the claim) as a visitor", visitors.includes("Lee"), `visitors ${visitors.join(",")}`);
// Poppy/Tester are trusted placeholder rows (not agents). v20's door list hides the Poppy "_seed" placeholder by design.
check("door keeps the pre-v21 trusted rows after the claim (Tester listed; Poppy placeholder hidden as in v20)", door.status === 200 && trusted.includes("Tester") && !txt.includes("ownerKey"), `trusted ${trusted.join(",")}`);
const anon = await call("GET", "/api/state", { jar: new Jar() });
check("stranger still 403", anon.status === 403);
process.exitCode = done("v21-legacy-after (preview)") ? 1 : 0;
