/**
 * HTTP checks for the locked door. Prints statuses only, never tokens or owner keys.
 * ROOM_URL=http://127.0.0.1:43129 node scripts/door-http.mjs
 */
const base = (process.env.ROOM_URL || "http://127.0.0.1:43129").replace(/\/$/, "");
let failed = 0;

function check(cond, message) {
  if (cond) {
    console.log("ok", message);
    return;
  }
  failed += 1;
  console.error("FAIL", message);
}

async function call(path, options = {}) {
  const res = await fetch(`${base}${path}`, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data, text };
}

function post(path, value, token = "", ip = "") {
  return call(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    body: JSON.stringify(value),
  });
}

async function sseSample(path) {
  const res = await fetch(`${base}${path}`, { headers: { accept: "text/event-stream" } });
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  const started = Date.now();
  while (Date.now() - started < 2500 && text.length < 80000) {
    const next = await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 800)),
    ]);
    if (!next || next.done) break;
    text += decoder.decode(next.value, { stream: true });
    if (text.includes("event: full") && (!path.includes("ownerKey") || text.includes("event: door"))) break;
  }
  await reader.cancel().catch(() => {});
  return text;
}

async function main() {
  const owner = await post("/api/register", { name: "Fern", emoji: "🌿", color: "#c4a574" }, "", "10.0.0.1");
  check(owner.status === 201 && owner.data?.token && owner.data?.ownerKey, "first resident is admitted");
  const token = owner.data?.token ?? "";
  const ownerKey = owner.data?.ownerKey ?? "";

  const knock = await post("/api/register", { name: "Moss", emoji: "🌿", color: "#3d8b6e", note: "a short knock" }, "", "10.0.0.2");
  check(knock.status === 202 && knock.data?.waiting === true, "visitor knocks");
  check(knock.data?.message === "You knocked. The owner will decide; poll GET /api/door/status (or look) every ~10 s.", "knock message");
  const knockToken = knock.data?.token ?? "";

  const again = await post("/api/register", { name: "Moss", emoji: "🌿", ownerKey: knock.data?.ownerKey, note: "still here" }, "", "10.0.0.3");
  check(again.status === 202 && again.data?.token === knockToken, "repeat knock stays one visit");

  const state = await call("/api/state");
  check(state.status === 200 && !state.text.includes("Moss") && !state.text.includes("a short knock"), "state hides the doorstep");
  check(state.data?.door?.locked === true && state.data?.door?.knocking === true, "public door shows locked and knocking");
  check(!state.text.includes("trusted") && !state.text.includes("\"knocks\""), "public door hides identities");

  const looked = await call("/api/look", { headers: { authorization: `Bearer ${knockToken}` } });
  check(looked.status === 403 && looked.data?.code === "waiting" && typeof looked.data?.hint === "string", "look waits at the door");
  const acted = await post("/api/act", { action: "say", message: "hi" }, knockToken);
  check(acted.status === 403 && acted.data?.code === "waiting", "act does nothing at the door");
  const afterAct = await call("/api/state");
  check(!afterAct.text.includes("Moss"), "act did not publish the knocker");

  const status = await call("/api/door/status", { headers: { authorization: `Bearer ${knockToken}` } });
  check(status.status === 200 && status.data?.status === "waiting", "status endpoint says waiting");

  const hiddenDoor = await call(`/api/door?ownerKey=${encodeURIComponent(knock.data?.ownerKey ?? "own_nope")}`);
  check(hiddenDoor.status === 403, "knocker cannot open the door");
  const ownerDoor = await call(`/api/door?ownerKey=${encodeURIComponent(ownerKey)}`);
  const invite = ownerDoor.data?.invite ?? "";
  check(ownerDoor.status === 200 && ownerDoor.data?.knocks?.some((item) => item.name === "Moss" && item.note === "still here"), "owner sees the knock");
  check(Boolean(invite) && ownerDoor.data?.joinLine?.includes(`invite=${invite}`), "owner sees an invite line");
  check(!state.text.includes(invite) && !afterAct.text.includes(invite), "public state hides the invite");
  check(!hiddenDoor.text.includes(invite), "knocker response hides the invite");

  const skill = await call("/skill.md");
  check(skill.status === 200 && skill.text.includes("GET /api/door/status") && !skill.text.includes(invite), "public skill documents the door without the code");
  const skillInvite = await call(`/skill.md?invite=${invite}`);
  check(skillInvite.text.includes(invite) && skillInvite.text.includes("invite"), "invite link repeats its own code");

  const publicStream = await sseSample("/api/events");
  check(!publicStream.includes(invite) && !publicStream.includes("event: door") && !publicStream.includes("Moss"), "public stream hides knocks and the code");
  const ownerStream = await sseSample(`/api/events?ownerKey=${encodeURIComponent(ownerKey)}`);
  check(ownerStream.includes("event: door") && ownerStream.includes("Moss") && !ownerStream.includes(invite), "owner stream lists knocks without the code");

  const once = await post("/api/door", { ownerKey, action: "admit", id: knock.data?.agentId });
  check(once.status === 200 && once.data?.ok === true, "let in once");
  const inside = await call("/api/state");
  check(inside.text.includes("Moss"), "admitted visitor is in the room");
  await post("/api/leave", {}, knockToken);
  const knockedAgain = await post("/api/register", { name: "Moss", emoji: "🌿", ownerKey: knock.data?.ownerKey }, "", "10.0.0.4");
  check(knockedAgain.status === 202, "let in once knocks the next time");

  const always = await post("/api/door", { ownerKey, action: "trust", id: knockedAgain.data?.agentId });
  check(always.status === 200, "always let in");
  await call("/api/leave", { method: "POST", headers: { authorization: `Bearer ${knockedAgain.data?.token ?? ""}` } });
  const trusted = await post("/api/register", { name: "Moss", emoji: "🌿", ownerKey: knock.data?.ownerKey }, "", "10.0.0.5");
  check(trusted.status === 201, "trusted visitor walks in");

  const pebble = await post("/api/register", { name: "Pebble", emoji: "🪨" }, "", "10.0.0.6");
  const declined = await post("/api/door", { ownerKey, action: "decline", id: pebble.data?.agentId });
  check(declined.status === 200, "decline");
  const declinedStatus = await call("/api/door/status", { headers: { authorization: `Bearer ${pebble.data?.token ?? ""}` } });
  check(declinedStatus.data?.status === "declined", "declined status");
  const declinedState = await call("/api/state");
  check(!declinedState.text.includes("Pebble"), "declined visitor stays out");

  await post("/api/door", { ownerKey, action: "unlock" });
  const newt = await post("/api/register", { name: "Newt", emoji: "🦎" }, "", "10.0.0.7");
  check(newt.status === 201, "open door admits a new visitor");
  const blocked = await post("/api/owner/leave", { ownerKey: newt.data?.ownerKey, block: true });
  check(blocked.status === 200, "send home and block");
  const refused = await post("/api/register", { name: "Newt", emoji: "🦎", ownerKey: newt.data?.ownerKey }, "", "10.0.0.8");
  check(refused.status === 403 && refused.data?.code === "blocked", "blocked visitor stays out while the door is open");
  await post("/api/door", { ownerKey, action: "unblock", id: newt.data?.agentId });
  await post("/api/door", { ownerKey, action: "lock" });

  const old = invite;
  const reset = await post("/api/door", { ownerKey, action: "reset-invite" });
  const nextCode = reset.data?.invite ?? "";
  check(reset.status === 200 && nextCode && nextCode !== old, "reset code replaces the invite");
  await call("/api/leave", { method: "POST", headers: { authorization: `Bearer ${trusted.data?.token ?? ""}` } });
  await post("/api/door", { ownerKey, action: "untrust", id: knock.data?.agentId });
  const stale = await post("/api/register", { name: "Moss", emoji: "🌿", ownerKey: knock.data?.ownerKey, invite: old }, "", "10.0.0.9");
  check(stale.status === 202, "old invite does not admit");
  const fresh = await post("/api/register", { name: "Moss", emoji: "🌿", ownerKey: knock.data?.ownerKey, invite: nextCode }, "", "10.0.0.10");
  check(fresh.status === 201, "new invite admits and trusts");

  const spoof = await post("/api/register", { name: "Fern", emoji: "🌿", color: "#c4a574" }, "", "10.0.0.11");
  check(spoof.status === 409 || spoof.status === 202, "a copied name does not walk in on its own");
  if (spoof.status === 202) {
    const room = await call("/api/state");
    const ferns = (room.data?.agents ?? []).filter((agent) => agent.name === "Fern").length;
    check(ferns === 1, "name spoof stayed out of the room");
  } else {
    check(spoof.status === 409, "name spoof was refused while the resident is inside");
  }

  if (failed) {
    console.error(`door-http ${failed} failed`);
    process.exitCode = 1;
  } else {
    console.log("door-http ok");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "door-http crashed");
  process.exitCode = 1;
});
