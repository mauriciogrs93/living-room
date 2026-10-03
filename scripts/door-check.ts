import assert from "node:assert/strict";
import { RoomEngine } from "../lib/room/engine";
import { KNOCK_MESSAGE, KNOCK_MS } from "../lib/room/door";

type Reg = ReturnType<RoomEngine["register"]>;

function admitted(result: Reg) {
  return result.ok === true && !("waiting" in result && result.waiting);
}

function waiting(result: Reg) {
  return result.ok === true && "waiting" in result && result.waiting === true;
}

function names(engine: RoomEngine) {
  return engine.snapshot().agents.map((agent) => agent.name).sort();
}

function openRoom() {
  const engine = new RoomEngine();
  engine.door.locked = false;
  engine.door.migrated = true;
  return engine;
}

function founder(name = "Fern", emoji = "🌿") {
  const engine = new RoomEngine();
  const owner = engine.register({ name, emoji, color: "#c4a574", ip: "owner" });
  assert.equal(admitted(owner), true, `${name} should walk in as the first resident`);
  assert.equal(owner.ok, true);
  return { engine, owner };
}

function testKnockAndSpoof() {
  const { engine, owner } = founder("Poppy", "🌸");
  assert.equal(owner.ok, true);
  const spoofInside = engine.register({ name: "Poppy", emoji: "🌸", color: "#111111", ip: "spoof" });
  assert.equal(spoofInside.ok, false, "a second Poppy cannot enter while the real one is inside");
  assert.equal(engine.snapshot().agents.length, 1);

  assert.equal(owner.ok, true);
  const left = engine.leave(owner.ok ? owner.token : "");
  assert.equal(left.ok, true);

  const spoof = engine.register({ name: "Poppy", emoji: "🌸", color: "#111111", ip: "spoof-2", note: "hello from the step" });
  assert.equal(waiting(spoof), true, "a new Poppy is a knock, not a trusted return");
  assert.equal(spoof.ok && spoof.message, KNOCK_MESSAGE);
  assert.equal(names(engine).includes("Poppy"), false);
  assert.equal(engine.door.trusted.some((person) => person.name === "Poppy" && spoof.ok && person.id === spoof.agentId), false);
  assert.equal(JSON.stringify(engine.snapshot()).includes("hello from the step"), false);
  assert.equal(JSON.stringify(engine.snapshot()).includes(engine.door.invite), false);

  const again = engine.register({ name: "Poppy", emoji: "🌸", ownerKey: spoof.ok ? spoof.ownerKey : "", ip: "spoof-2", note: "still here" });
  assert.equal(waiting(again), true);
  assert.equal(engine.door.knocks.length, 1);
  assert.equal(engine.door.knocks[0]?.note, "still here");
  assert.equal(again.ok && spoof.ok && again.token === spoof.token, true);

  const looked = engine.look(spoof.ok ? spoof.token : "");
  assert.equal(looked.ok, false);
  if (!looked.ok) {
    assert.equal(looked.status, 403);
    assert.equal(looked.code, "waiting");
    assert.match(looked.hint ?? "", /door\/status/);
  }
  const before = engine.snapshot().events.length;
  const acted = engine.act(spoof.ok ? spoof.token : "", { action: "say", message: "hi" });
  assert.equal(acted.ok, false);
  if (!acted.ok) assert.equal(acted.code, "waiting");
  assert.equal(engine.snapshot().events.length, before);

  const real = engine.register({ name: "Poppy", emoji: "🌼", ownerKey: owner.ok ? owner.ownerKey : "", ip: "owner" });
  assert.equal(admitted(real), true, "the stored Poppy credential still walks in");
  assert.deepEqual(names(engine), ["Poppy"]);
}

function testLetInOnceAlwaysDecline() {
  const { engine, owner } = founder();
  assert.equal(owner.ok, true);
  const key = owner.ok ? owner.ownerKey : "";
  const moss = engine.register({ name: "Moss", emoji: "🌿", color: "#3d8b6e", ip: "m", note: "just visiting" });
  assert.equal(waiting(moss), true);
  const mossId = moss.ok ? moss.agentId : "";
  const once = engine.doorAct(key, "admit", mossId);
  assert.equal(once.ok, true);
  assert.deepEqual(names(engine), ["Fern", "Moss"]);
  assert.equal(engine.door.trusted.some((person) => person.id === mossId), false);
  assert.equal(engine.leave(moss.ok ? moss.token : "").ok, true);
  const back = engine.register({ name: "Moss", emoji: "🌿", ownerKey: moss.ok ? moss.ownerKey : "", ip: "m" });
  assert.equal(waiting(back), true, "let in once does not trust the next join");

  const always = engine.doorAct(key, "trust", back.ok ? back.agentId : "");
  assert.equal(always.ok, true);
  assert.equal(engine.door.trusted.some((person) => person.id === mossId), true);
  assert.equal(engine.leave(back.ok ? back.token : "").ok, true);
  const trustedBack = engine.register({ name: "Moss", emoji: "🌿", ownerKey: moss.ok ? moss.ownerKey : "", ip: "m" });
  assert.equal(admitted(trustedBack), true, "always let in walks them in later");
  assert.equal(engine.leave(trustedBack.ok ? trustedBack.token : "").ok, true);

  const pebble = engine.register({ name: "Pebble", emoji: "🪨", ip: "p", note: "a short note" });
  assert.equal(waiting(pebble), true);
  const declined = engine.doorAct(key, "decline", pebble.ok ? pebble.agentId : "");
  assert.equal(declined.ok, true);
  assert.equal(names(engine).includes("Pebble"), false);
  const status = engine.doorStatus(pebble.ok ? pebble.token : "");
  assert.equal(status.ok && status.status, "declined");
  const looked = engine.look(pebble.ok ? pebble.token : "");
  assert.equal(looked.ok, false);
  if (!looked.ok) assert.equal(looked.code, "declined");
  const retry = engine.register({ name: "Pebble", emoji: "🪨", ownerKey: pebble.ok ? pebble.ownerKey : "", ip: "p2" });
  assert.equal(waiting(retry), true, "a declined visitor can knock again later");
}

function testExpireBlockInviteOpen() {
  const { engine, owner } = founder();
  assert.equal(owner.ok, true);
  const key = owner.ok ? owner.ownerKey : "";
  const guest = engine.register({ name: "Wren", emoji: "🐦", ip: "w" });
  assert.equal(waiting(guest), true);
  const knock = engine.door.knocks[0];
  assert.ok(knock);
  knock.at = Date.now() - KNOCK_MS - 1000;
  engine.settle();
  assert.equal(engine.door.knocks.length, 0);
  const expired = engine.doorStatus(guest.ok ? guest.token : "");
  assert.equal(expired.ok && expired.status, "expired");
  assert.equal(names(engine).includes("Wren"), false);

  engine.doorAct(key, "unlock");
  const inside = engine.register({ name: "Wren", emoji: "🐦", ownerKey: guest.ok ? guest.ownerKey : "", ip: "w" });
  assert.equal(admitted(inside), true);
  assert.equal(engine.door.trusted.some((person) => person.name === "Wren"), false, "an open door does not add trust");
  const sent = engine.ownerLeave(inside.ok ? inside.ownerKey : "", true);
  assert.equal(sent.ok, true);
  engine.doorAct(key, "unlock");
  const blocked = engine.register({ name: "Wren", emoji: "🐦", ownerKey: inside.ok ? inside.ownerKey : "", ip: "w" });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "blocked");
  const unblocked = engine.doorAct(key, "unblock", inside.ok ? inside.agentId : "");
  assert.equal(unblocked.ok, true);
  const after = engine.register({ name: "Wren", emoji: "🐦", ownerKey: inside.ok ? inside.ownerKey : "", ip: "w3" });
  assert.equal(admitted(after), true);

  engine.doorAct(key, "lock");
  const code = engine.door.invite;
  const invited = engine.register({ name: "Ivy", emoji: "🍃", invite: code, ip: "ivy" });
  assert.equal(admitted(invited), true, "a valid invite walks in");
  assert.equal(engine.door.trusted.some((person) => person.name === "Ivy"), true);
  engine.doorAct(key, "reset-invite");
  assert.notEqual(engine.door.invite, code);
  assert.equal(engine.leave(invited.ok ? invited.token : "").ok, true);
  const stale = engine.register({ name: "Ivy", emoji: "🍃", ownerKey: invited.ok ? invited.ownerKey : "", invite: code, ip: "ivy" });
  assert.equal(admitted(stale), true, "Ivy stays trusted after the code changes");
  assert.equal(engine.leave(stale.ok ? stale.token : "").ok, true);
  engine.doorAct(key, "untrust", invited.ok ? invited.agentId : "");
  const oldCode = engine.register({ name: "Ivy", emoji: "🍃", ownerKey: invited.ok ? invited.ownerKey : "", invite: code, ip: "ivy2" });
  assert.equal(waiting(oldCode), true, "the old invite code no longer opens the door");
  const fresh = engine.register({ name: "Ivy", emoji: "🍃", ownerKey: invited.ok ? invited.ownerKey : "", invite: engine.door.invite, ip: "ivy2" });
  assert.equal(admitted(fresh), true, "the new invite code works");
}

function testLimitsAndPrivacy() {
  const { engine, owner } = founder();
  assert.equal(owner.ok, true);
  const key = owner.ok ? owner.ownerKey : "";
  const tooLong = engine.register({ name: "Long", emoji: "🌿", note: "x".repeat(141), ip: "long" });
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.equal(tooLong.status, 400);

  for (let i = 0; i < 4; i += 1) {
    const knock = engine.register({ name: `Tap${i}`, emoji: "👋", ip: "same-ip" });
    assert.equal(waiting(knock), true, `knock ${i} should be accepted`);
  }
  const limited = engine.register({ name: "Tap9", emoji: "👋", ip: "same-ip" });
  assert.equal(limited.ok, false);
  if (!limited.ok) assert.equal(limited.code, "knock_limit");

  const crowd = new RoomEngine();
  const host = crowd.register({ name: "Host", emoji: "🌿", ip: "host" });
  assert.equal(admitted(host), true);
  for (let i = 0; i < 10; i += 1) {
    const knock = crowd.register({ name: `Queue${i}`, emoji: "👋", ip: `ip-${i}` });
    assert.equal(waiting(knock), true, `queue slot ${i}`);
  }
  const full = crowd.register({ name: "Overflow", emoji: "👋", ip: "ip-extra" });
  assert.equal(full.ok, false);
  if (!full.ok) assert.equal(full.code, "door_full");

  const stranger = engine.register({ name: "Lark", emoji: "🐦", ip: "lark-ip" });
  assert.equal(waiting(stranger), true);
  const hidden = JSON.stringify(engine.snapshot());
  assert.equal(hidden.includes("Lark"), false);
  assert.equal(hidden.includes(engine.door.invite), false);
  assert.equal(hidden.includes("lr_"), false);
  const strangerView = engine.doorView(stranger.ok ? stranger.ownerKey : "");
  assert.equal(strangerView.ok, false);
  const ownerView = engine.doorView(key);
  assert.equal(ownerView.ok, true);
  if (ownerView.ok) {
    assert.equal(ownerView.knocks.some((knock) => knock.name === "Lark"), true);
    const packed = JSON.stringify(ownerView);
    assert.equal(packed.includes("lr_"), false);
    assert.equal(packed.includes(ownerView.invite), true);
  }
  const brief = engine.doorBrief(key);
  assert.ok(brief);
  const packedBrief = JSON.stringify(brief);
  assert.equal(packedBrief.includes(engine.door.invite), false);
  assert.equal(packedBrief.includes("own_"), false);
  assert.equal(engine.doorBrief(stranger.ok ? stranger.ownerKey : ""), null);
}

function testMigration() {
  const engine = openRoom();
  const poppy = engine.register({ name: "Poppy", emoji: "🌸", color: "#e07a3d", ip: "poppy" });
  const tester = engine.register({ name: "Tester", emoji: "🧪", color: "#3d8be0", ip: "tester" });
  const pip = engine.register({ name: "Pip", emoji: "📎", color: "#888888", ip: "pip" });
  const moss = engine.register({ name: "Moss", emoji: "🌿", color: "#336633", ip: "moss" });
  const roomTester = engine.register({ name: "Room Tester", emoji: "🧪", color: "#3d8be0", ip: "room" });
  assert.equal(admitted(poppy) && admitted(tester) && admitted(pip) && admitted(moss) && admitted(roomTester), true);
  assert.equal(poppy.ok && tester.ok && pip.ok && moss.ok && roomTester.ok, true);
  if (!poppy.ok || !tester.ok || !pip.ok || !moss.ok || !roomTester.ok) return;

  const saved = engine.serialize();
  const testerRow = saved.agents.find((agent) => agent.id === tester.agentId);
  const pipRow = saved.agents.find((agent) => agent.id === pip.agentId);
  assert.ok(testerRow && pipRow && testerRow.ownerKey);
  pipRow.ownerKey = testerRow.ownerKey;
  saved.agents.push({
    ...testerRow,
    id: "agt_impostor",
    name: "Tester",
    emoji: "🌿",
    color: "#3d8be0",
    token: `lr_${"ab".repeat(18)}`,
    ownerKey: `own_${"cd".repeat(18)}`,
  });
  saved.door = { ...saved.door!, trusted: [], blocked: [], knocks: [], settled: [], migrated: false, locked: true };

  const next = new RoomEngine();
  next.hydrate(saved);
  assert.deepEqual(names(next), ["Pip", "Poppy", "Tester"]);
  assert.deepEqual(next.door.knocks.map((knock) => knock.name).sort(), ["Moss", "Room Tester", "Tester"]);
  const trustedNames = next.door.trusted.map((person) => person.name).sort();
  assert.deepEqual(trustedNames, ["Pip", "Poppy", "Tester"]);
  assert.equal(next.door.trusted.some((person) => person.id === "agt_impostor"), false);
  assert.equal(next.door.trusted.some((person) => person.id === pip.agentId), true);
  const tape = JSON.stringify({ events: next.snapshot().events, diary: next.snapshot().diary });
  assert.equal(tape.includes("Moss"), false);
  assert.equal(JSON.stringify(next.snapshot()).includes(next.door.invite), false);

  assert.equal(next.leave(tester.token).ok, true);
  assert.equal(next.doorAct(poppy.ownerKey, "decline", "agt_impostor").ok, true);
  const fake = next.register({ name: "Tester", emoji: "🧪", color: "#3d8be0", ip: "fake-tester" });
  assert.equal(waiting(fake), true, "Tester's name and icon do not grant trust without the stored credential");
  assert.equal(next.door.trusted.some((person) => fake.ok && person.id === fake.agentId), false);
  const returned = next.register({ name: "Tester", emoji: "🧪", color: "#3d8be0", ownerKey: tester.ownerKey, ip: "tester" });
  assert.equal(admitted(returned), true, "Tester's stored credential still walks in");
}

function testAbsentSeedThenClaim() {
  const saved = new RoomEngine().serialize();
  saved.agents = [];
  saved.door = {
    ...saved.door!,
    trusted: [],
    blocked: [],
    knocks: [],
    settled: [],
    migrated: false,
    locked: true,
  };
  const next = new RoomEngine();
  next.hydrate(saved);
  assert.equal(names(next).length, 0);
  assert.equal(
    next.door.trusted.some((person) => person.id === "agt_b71b2b01" && person.name === "Tester" && person.ownerKey === ""),
    true,
  );
  assert.equal(next.door.trusted.some((person) => person.name === "Poppy" && person.ownerKey === ""), true);
  const tester = next.register({ name: "Tester", emoji: "🧪", color: "#3d8be0", ip: "claim-tester" });
  assert.equal(admitted(tester), true, "Tester is recognised from the seed and walks in");
  assert.equal(tester.ok, true);
  if (!tester.ok) return;
  const row = next.door.trusted.find((person) => person.id === tester.agentId);
  assert.ok(row && row.ownerKey === tester.ownerKey && row.ownerKey.startsWith("own_"));
  const view = next.doorView(tester.ownerKey);
  assert.equal(view.ok, true);
  if (view.ok) assert.match(view.invite, /^[0-9a-f]{8}$/);
  const other = next.register({ name: "Rowan", emoji: "🌿", ip: "after-claim" });
  assert.equal(waiting(other), true, "once a steward key exists, a stranger knocks");

  const held = new RoomEngine();
  const moss = held.register({ name: "Moss", emoji: "🌿", ip: "moss-lock" });
  assert.equal(admitted(moss), true);
  const blob = held.serialize();
  blob.door = { ...blob.door!, trusted: [], blocked: [], knocks: [], settled: [], migrated: false, locked: true };
  const locked = new RoomEngine();
  locked.hydrate(blob);
  assert.equal(locked.door.knocks.some((knock) => knock.name === "Moss"), true);
  assert.equal(locked.door.trusted.some((person) => person.ownerKey), false);
  const ada = locked.register({ name: "Ada", emoji: "🌿", ip: "ada-claim" });
  assert.equal(admitted(ada), true, "an empty steward list cannot leave every agent knocking");
  assert.equal(locked.doorView(ada.ok ? ada.ownerKey : "").ok, true);
}

testKnockAndSpoof();
testLetInOnceAlwaysDecline();
testExpireBlockInviteOpen();
testLimitsAndPrivacy();
testMigration();
testAbsentSeedThenClaim();
console.log("door-check ok");
