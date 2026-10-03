// Spot-check that the rate limits hold on the preview (Supabase-backed counters, all calls from one IP).
//   VIA=<preview url> node v21-limits-preview.mjs   (locks this IP out of register/watch/sign-in for ~10 min)
import { Jar, call, check, done } from "./v21-lib.mjs";
let last;
for (let i = 0; i < 6; i += 1) last = await call("POST", "/api/register", { body: { name: `Bad${i}x`, emoji: "🙂", invite: "a".repeat(26) } });
check("failed invites: 6th from one IP -> 429 invite_rate_limited + Retry-After", last.status === 429 && last.json?.code === "invite_rate_limited" && Number(last.headers.get("retry-after")) > 0, `${last.status} ${last.json?.code}`);
for (let i = 0; i < 11; i += 1) last = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: "b".repeat(26) } });
check("watch redemptions: 11th from one IP -> 429 + Retry-After", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `status ${last.status}`);
for (let i = 0; i < 6; i += 1) last = await call("POST", "/api/auth/otp", { body: { email: "not-an-email" } });
check("sign-in emails: 6th from one IP -> 429 + Retry-After (junk addresses, nothing sent)", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `status ${last.status}`);
process.exitCode = done("v21-limits-preview") ? 1 : 0;
