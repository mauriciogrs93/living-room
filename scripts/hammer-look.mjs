/**
 * Hammer GET /api/look while notes are posted.
 * Ten looks at a time, beside note posts, must return zero 503s.
 * Also checks note threads, the 5s ceiling, unknown routes, and approach spacing.
 *
 *   node scripts/hammer-look.mjs
 *   ROOM_URL=http://127.0.0.1:3847 node scripts/hammer-look.mjs
 */
const base = (process.env.ROOM_URL || "http://127.0.0.1:3847").replace(/\/$/, "");

async function call(path, options = {}) {
  const started = Date.now();
  const res = await fetch(`${base}${path}`, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, ms: Date.now() - started, text };
}

function json(path, token, value) {
  return call(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(value),
  });
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  const registered = await json("/api/register", "", { name: "Rowan", emoji: "🌿", color: "#6e9a86" });
  if (registered.status !== 201 || !registered.body?.token) {
    fail(`register ${registered.status} ${JSON.stringify(registered.body)}`);
    return;
  }
  const { token, ownerKey } = registered.body;
  const auth = { authorization: `Bearer ${token}` };

  const first = await json("/api/note", "", { ownerKey, message: "Older note. Put the kettle on." });
  const second = await json("/api/note", "", { ownerKey, message: "Newest note. Water the plant." });
  if (!first.body?.ok || !second.body?.ok) {
    fail(`notes ${JSON.stringify(first.body)} ${JSON.stringify(second.body)}`);
  }

  const looked = await call("/api/look", { headers: auth });
  const notes = looked.body?.notes ?? [];
  if (notes[0]?.text !== "Newest note. Water the plant.") {
    fail(`newest open note was not first: ${JSON.stringify(notes)}`);
  }
  if (typeof looked.body?.agents?.[0]?.idleSeconds !== "number") {
    fail(`look agents missing idleSeconds: ${JSON.stringify(looked.body?.agents?.[0])}`);
  }

  const reply = await json("/api/act", token, { action: "reply", message: "Watering it.", status: "on_it" });
  if (!reply.body?.ok) fail(`reply ${reply.status} ${JSON.stringify(reply.body)}`);

  const mail = await call(`/api/note?ownerKey=${encodeURIComponent(ownerKey)}`);
  const newest = (mail.body?.notes ?? []).find((note) => note.text.startsWith("Newest"));
  const older = (mail.body?.notes ?? []).find((note) => note.text.startsWith("Older"));
  if (newest?.status !== "on_it" || newest?.replies?.length !== 1) {
    fail(`reply did not land on the newest open note: ${JSON.stringify(mail.body?.notes)}`);
  }
  if (older?.status !== "open") fail(`older note should still be open: ${JSON.stringify(older)}`);

  const follow = await json("/api/act", token, {
    action: "reply",
    noteId: newest.id,
    message: "The plant is watered.",
    status: "done",
  });
  if (!follow.body?.ok) fail(`follow-up ${follow.status} ${JSON.stringify(follow.body)}`);

  const couldnt = await json("/api/act", token, {
    action: "reply",
    noteId: older.id,
    message: "I can't push up.",
    status: "couldnt",
    reason: "There is no push-up action.",
  });
  if (!couldnt.body?.ok) fail(`couldnt ${couldnt.status} ${JSON.stringify(couldnt.body)}`);
  const bare = await json("/api/act", token, { action: "reply", message: "No reason." , status: "couldnt" });
  if (bare.status !== 400) fail(`couldnt without reason should be 400, got ${bare.status}`);

  const unknown = await json("/api/act", token, { action: "look_out" });
  const unknownText = `${unknown.body?.error ?? ""} ${unknown.body?.hint ?? ""}`;
  if (!/did you mean/i.test(unknownText) || !/look_outside/.test(unknownText)) {
    fail(`did you mean missing: ${unknownText}`);
  }

  const missing = await call("/api/agents");
  if (missing.status !== 404 || missing.body?.ok !== false || typeof missing.body?.error !== "string") {
    fail(`unknown route ${missing.status} ${missing.text.slice(0, 180)}`);
  }

  const own = await json("/api/act", token, { action: "change_outfit", objectId: "wardrobe", outfit: "own" });
  if (!own.body?.ok) fail(`own outfit ${own.status} ${JSON.stringify(own.body)}`);

  const stream = await fetch(`${base}/api/events`);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const frames = [];
  const readUntil = Date.now() + 2500;
  while (Date.now() < readUntil && frames.length < 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const name = part.match(/^event: (\w+)/m)?.[1];
      const data = part.match(/^data: (.*)$/m)?.[1];
      if (name && data) frames.push({ name, data: JSON.parse(data) });
    }
  }
  if (frames[0]?.name !== "full" || !Array.isArray(frames[0].data.events)) fail(`first SSE frame was not a full snapshot`);
  const before = frames[0].data.events.length;
  const saidAt = Date.now();
  await json("/api/act", token, { action: "say", message: "Hammer hello." });
  while (Date.now() < saidAt + 800) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const name = part.match(/^event: (\w+)/m)?.[1];
      const data = part.match(/^data: (.*)$/m)?.[1];
      if (name && data) frames.push({ name, data: JSON.parse(data) });
    }
    if (frames.some((frame) => frame.name === "diff" && (frame.data.events ?? []).some((event) => /Hammer hello/.test(event.text)))) break;
  }
  const diff = frames.find((frame) => frame.name === "diff" && (frame.data.events ?? []).some((event) => /Hammer hello/.test(event.text)));
  const lag = Date.now() - saidAt;
  console.log(JSON.stringify({ sseLagMs: lag, diffEvents: diff?.data.events?.length ?? 0, before }));
  if (!diff) fail("SSE diff did not arrive");
  else if (lag > 500) fail(`SSE change took ${lag} ms`);
  else if ((diff.data.events ?? []).length > 3) fail("SSE diff resent the event history");
  await reader.cancel().catch(() => {});

  const state = await call("/api/state");
  const approaches = (state.body?.objects ?? []).map((object) => ({
    id: object.id,
    ax: object.approach.x,
    az: object.approach.z,
    x: object.position.x,
    z: object.position.z,
  }));
  for (const spot of approaches) {
    const gap = Math.hypot(spot.ax - spot.x, spot.az - spot.z);
    if (gap < 0.3 - 1e-6) fail(`${spot.id} approach is ${gap.toFixed(2)} m from the object`);
  }
  for (let i = 0; i < approaches.length; i += 1) {
    for (let j = i + 1; j < approaches.length; j += 1) {
      const a = approaches[i];
      const b = approaches[j];
      const gap = Math.hypot(a.ax - b.ax, a.az - b.az);
      if (gap < 0.5 - 1e-6) fail(`${a.id} and ${b.id} approaches are ${gap.toFixed(2)} m apart`);
    }
  }

  const lookTimes = [];
  let look503 = 0;
  let note503 = 0;
  let lookOther = 0;
  const started = Date.now();
  for (let wave = 0; wave < 4; wave += 1) {
    const looks = Array.from({ length: 10 }, () => call("/api/look", { headers: auth }));
    const posts = [0, 1].map((n) =>
      json("/api/note", "", { ownerKey, message: `Hammer note ${wave}-${n} ${Date.now()}` }),
    );
    const [looked, posted] = await Promise.all([Promise.all(looks), Promise.all(posts)]);
    for (const item of looked) {
      lookTimes.push(item.ms);
      if (item.status === 503) look503 += 1;
      else if (item.status !== 200) lookOther += 1;
    }
    for (const item of posted) {
      if (item.status === 503) note503 += 1;
    }
    const slow = [...looked, ...posted].filter((item) => item.ms > 5000);
    if (slow.length) fail(`look or note exceeded 5 seconds (${slow.map((item) => item.ms).join(", ")})`);
  }
  const sorted = [...lookTimes].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  console.log(
    JSON.stringify({
      hammerMs: Date.now() - started,
      looks: lookTimes.length,
      concurrency: 10,
      look503,
      note503,
      p95,
      max,
    }),
  );
  if (look503 || note503) fail(`room was busy: ${look503} look 503s, ${note503} note 503s`);
  if (lookOther) fail(`${lookOther} looks returned a status other than 200`);

  const waveNote = await json("/api/note", "", { ownerKey, message: "R7 test: please wave." });
  if (!waveNote.body?.ok) fail(`wave note ${waveNote.status} ${JSON.stringify(waveNote.body)}`);
  const mailbox = await call(`/api/note?ownerKey=${encodeURIComponent(ownerKey)}`);
  const waveId = (mailbox.body?.notes ?? []).find((note) => note.text.startsWith("R7 test"))?.id;
  if (!waveId) fail("wave note was not saved");
  const hung = [];
  async function limited(path, options = {}) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(`${base}${path}`, { ...options, signal: ctrl.signal });
      const text = await res.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { status: res.status, body, ms: Date.now() - started, hung: false };
    } catch (error) {
      hung.push(String(error));
      return { status: 0, body: null, ms: Date.now() - started, hung: true };
    } finally {
      clearTimeout(timer);
    }
  }
  const replyBody = JSON.stringify({ action: "reply", noteId: waveId, message: "Done: waved", status: "done" });
  const replyOpts = {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: replyBody,
  };
  const burst = await Promise.all([
    limited("/api/act", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "emote", emote: "wave" }),
    }),
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return limited("/api/act", replyOpts);
    })(),
    ...[0, 1, 2].map((n) =>
      limited("/api/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerKey, message: `R7 side note ${n} ${Date.now()}` }),
      }),
    ),
  ]);
  const slowBurst = burst.filter((item) => item.hung || item.ms > 5000);
  console.log(
    JSON.stringify({
      burstMs: burst.map((item) => item.ms),
      burstStatus: burst.map((item) => item.status),
      hangs: slowBurst.length,
    }),
  );
  if (slowBurst.length || hung.length) fail(`act or note hung: ${JSON.stringify(burst.map((item) => item.ms))}`);
  let saved = burst[1];
  if (saved.status === 503 && saved.body?.retry) saved = await limited("/api/act", replyOpts);
  if (!saved.body?.ok) fail(`done reply was not saved ${saved.status} ${JSON.stringify(saved.body)}`);
  const again = await limited("/api/act", replyOpts);
  const afterMail = await call(`/api/note?ownerKey=${encodeURIComponent(ownerKey)}`);
  const waved = (afterMail.body?.notes ?? []).find((note) => note.id === waveId);
  const copies = (waved?.replies ?? []).filter((reply) => reply.text === "Done: waved").length;
  if (waved?.status !== "done" || copies !== 1) fail(`reply retry was not idempotent: ${JSON.stringify(waved)}`);
  if (again.ms > 5000 || again.hung) fail("retry hung");
  const publicEvents = (await call("/api/state")).body?.events ?? [];
  const leaked = publicEvents.some((event) => /Done: waved|R7 test/.test(event.text));
  const generic = publicEvents.some((event) => /replied to a note/.test(event.text));
  if (leaked || !generic) fail(`public reply text: ${JSON.stringify(publicEvents.slice(-4))}`);

  const off = await json("/api/radio", "", { intent: "off" });
  if (!off.body?.ok) fail(`radio off ${off.status}`);
  const after = await call("/api/state");
  const logged = (after.body?.events ?? []).some((event) => /turned the radio off/.test(event.text));
  if (!logged) fail("viewer radio off was not logged");

  const left = await call("/api/leave", { method: "POST", headers: auth });
  if (!left.body?.ok) fail(`leave ${left.status} ${JSON.stringify(left.body)}`);
  if (!process.exitCode) console.log("hammer-look ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
