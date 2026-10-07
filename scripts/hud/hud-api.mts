// In-process checks for radio prev/tune and TV channel. No network, no email.
//   npx tsx scripts/hud/hud-api.mts
process.env.ROOM_STORE = "memory";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
delete process.env.VERCEL_ENV;

const results: boolean[] = [];
function check(name: string, ok: unknown) {
  results.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const { RoomEngine } = await import("../../lib/room/engine");
const { directory } = await import("../../lib/apartments/directory");
const { freshApartmentState, mintWatch, redeemWatch, WATCH_COOKIE, roomFor } = await import("../../lib/apartments/resolve");
const { POST: radioPost } = await import("../../app/api/radio/route");
const { POST: tapPost } = await import("../../app/api/tap/route");

const engine = new RoomEngine();
const internals = engine as unknown as {
  house: { radioIndex: number; radioOn: boolean; stations: { name: string }[] };
  objects: Map<string, { state: { power?: boolean; channel?: number; channelName?: string } }>;
  events: { text: string }[];
};
const start = internals.house.radioIndex;
const prev = engine.controlRadio("prev");
check("owner prev turns the radio on and steps back", prev.ok === true && internals.house.radioOn && internals.house.radioIndex === start - 1);
const tuned = engine.controlRadio("tune", undefined, 1);
check("owner tune sets that station", tuned.ok === true && internals.house.radioOn && internals.house.radioIndex === 1 && tuned.ok && tuned.name.length > 0);
const snap = engine.snapshot();
check("snapshot lists station names and the index", Array.isArray(snap.radio.stations) && snap.radio.stations.length >= 2 && snap.radio.index === 1 && snap.radio.stations.every((name) => !name.includes("http")));

const index = internals.house.radioIndex;
for (const station of [-1, internals.house.stations.length, 1.5, "1", null, undefined]) {
  const bad = engine.controlRadio("tune", undefined, station);
  check(`tune ${String(station)} is 400`, bad.ok === false && bad.ok === false && "status" in bad && bad.status === 400 && internals.house.radioIndex === index);
}

const on = engine.controlRadio("on");
const off = engine.controlRadio("off");
const next = engine.controlRadio("next");
check("on off next still work", on.ok && off.ok && off.on === false && next.ok && next.on === true);

const channel = engine.setTvChannel(3);
const tv = internals.objects.get("tv");
check("owner channel 3 turns the TV on", channel.ok === true && tv?.state.power === true && tv?.state.channel === 3 && tv?.state.channelName === "Cartoon Hour");
const logged = internals.events.some((event) => event.text === "A viewer switched the television to Cartoon Hour.");
check("channel log keeps the viewer line", logged);
const power = tv?.state.power;
engine.viewerTap({ id: "tv" });
check("plain tv tap still toggles power", internals.objects.get("tv")?.state.power === !power);

for (const n of [0, 6, 2.5, "3"]) {
  const before = internals.objects.get("tv")?.state.channel;
  const bad = engine.setTvChannel(n);
  check(`channel ${String(n)} is 400`, bad.ok === false && "status" in bad && bad.status === 400 && internals.objects.get("tv")?.state.channel === before);
}

let blocked: { ok: boolean; retryAfter: number } = { ok: true, retryAfter: 0 };
for (let i = 0; i < 21; i += 1) blocked = engine.allow("radio:10.77.9.9", 20, 60_000);
check("21st radio change is limited", blocked.ok === false && blocked.retryAfter >= 1);

const created = await directory().create("00000000-0000-4000-8000-0000000000ab", freshApartmentState("owner"), { locked: true, knocking: false });
const room = roomFor(created.id);
const before = await room.snapshot();
const none = await radioPost(new Request("http://127.0.0.1/api/radio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "prev" }) }));
check("no session is 403", none.status === 403);
const minted = await mintWatch(created.id);
const redeemed = await redeemWatch(minted.code);
check("watch code minted", redeemed.ok === true);
if (redeemed.ok) {
  const watch = await radioPost(
    new Request("http://127.0.0.1/api/radio", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${WATCH_COOKIE}=${redeemed.token}`, "x-forwarded-for": "10.77.4.4" },
      body: JSON.stringify({ intent: "tune", station: 1 }),
    }),
  );
  const tap = await tapPost(
    new Request("http://127.0.0.1/api/tap", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${WATCH_COOKIE}=${redeemed.token}`, "x-forwarded-for": "10.77.4.5" },
      body: JSON.stringify({ id: "tv", channel: 2 }),
    }),
  );
  const after = await room.snapshot();
  check("watcher radio and channel are 403", watch.status === 403 && tap.status === 403);
  check("watcher changes nothing", after.radio.on === before.radio.on && after.radio.index === before.radio.index && after.objects.find((object) => object.id === "tv")?.state.channel === before.objects.find((object) => object.id === "tv")?.state.channel);
}

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length}`);
if (failed) process.exit(1);
