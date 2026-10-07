import { preflight } from "@/lib/http";
import { roomFailure, type RoomPort } from "@/lib/room/access";
import { forbiddenViewer, ownerContext, viewerContext, watchApartment, watchEndCopy } from "@/lib/apartments/resolve";
import { diffSnapshot } from "@/lib/room/sse-diff";
import type { Snapshot } from "@/lib/room/types";

// v21: resume history is per apartment, so a Last-Event-ID can never pull another apartment's frame.
const history: { apt: string; id: string; snapshot: Snapshot }[] = [];

function remember(apt: string, snapshot: Snapshot) {
  const id = snapshot.events[snapshot.events.length - 1]?.id;
  if (!id || history.some((item) => item.apt === apt && item.id === id)) return;
  history.push({ apt, id, snapshot });
  if (history.length > 50) history.shift();
}

function frameId(snapshot: Snapshot) {
  return snapshot.events[snapshot.events.length - 1]?.id ?? String(snapshot.serverTime);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

const STREAM_MS = 24_000;
const PULSE_MS = 2_000;
const BEAT_MS = 2_000;

const sseHeaders = {
  // v21: private stream (cookie-authenticated), no wildcard CORS.
  Vary: "Cookie",
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since") || req.headers.get("last-event-id") || "";
  let engine: RoomPort;
  let apt = "";
  let identity = "";
  let watch = false;
  try {
    const viewer = await viewerContext(req);
    if (viewer instanceof Response) return viewer;
    if (!viewer) return forbiddenViewer();
    engine = viewer.room as RoomPort;
    apt = viewer.apartmentId;
    watch = viewer.role === "watch";
    if (viewer.role === "owner") {
      const owner = await ownerContext(req);
      if (!(owner instanceof Response)) identity = owner.identity;
    }
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe = () => {};
  let closed = false;
  const deadline = Date.now() + STREAM_MS;
  let last: Snapshot | null = null;
  let beat = 0;
  let dogAt = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const raw = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const push = (snapshot: Snapshot, resume: Snapshot | null = null) => {
        if (closed) return;
        const next = diffSnapshot(resume ?? last, snapshot, dogAt);
        dogAt = next.dogAt;
        last = snapshot;
        remember(apt, snapshot);
        if (!next.changed && resume) {
          raw(`id: ${frameId(snapshot)}\nevent: diff\ndata: ${JSON.stringify({ serverTime: snapshot.serverTime })}\n\n`);
          return;
        }
        if (!next.changed) return;
        const name = next.full ? "full" : "diff";
        raw(`id: ${frameId(snapshot)}\nevent: ${name}\ndata: ${JSON.stringify(next.body)}\n\n`);
      };
      let doorSig = "";
      let sentState = "";
      const pushDoor = async () => {
        if (!identity) return;
        try {
          const brief = await engine.doorBrief(identity);
          if (!brief) return;
          const body = {
            paused: brief.paused,
            visitors: brief.visitors,
            trusted: brief.trusted,
            blocked: brief.blocked,
          };
          const sig = JSON.stringify(body);
          if (sig === doorSig) return;
          doorSig = sig;
          raw(`event: door\ndata: ${sig}\n\n`);
        } catch {
          /* a missed door frame must not close the public stream */
        }
      };
      const tick = async (heartbeat: boolean) => {
        if (closed) return;
        if (Date.now() >= deadline) {
          raw(`event: bye\ndata: {}\n\n`);
          stop();
          return;
        }
        if (watch && !(await watchApartment(req))) {
          raw(`event: bye\ndata: ${JSON.stringify({ reason: "watch_ended", error: await watchEndCopy(req) })}\n\n`);
          stop();
          return;
        }
        try {
          const snapshot = await engine.snapshot();
          const tag = String(snapshot.events[snapshot.events.length - 1]?.id ?? "");
          push(snapshot, null);
          if (!tag || tag !== sentState) {
            sentState = tag;
            await pushDoor();
          }
          if (heartbeat || Date.now() - beat >= BEAT_MS) {
            raw(`: ping\n\n`);
            beat = Date.now();
          }
        } catch {
          stop();
        }
      };
      raw("retry: 1000\n\n");
      const prior = since ? history.find((item) => item.apt === apt && item.id === since)?.snapshot ?? null : null;
      if (prior) {
        try {
          push(await engine.snapshot(), prior);
        } catch {
          stop();
        }
      } else await tick(false);
      if (!engine.shared) unsubscribe = engine.subscribe((snapshot) => push(snapshot));
      timer = setInterval(() => void tick(false), PULSE_MS);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      unsubscribe();
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
