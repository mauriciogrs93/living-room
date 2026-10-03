import { json } from "@/lib/http";
import { roomFailure } from "@/lib/room/access";
import { requestSignal } from "@/lib/room/request-signal";

const LIMIT_MS = 5000;

function busy() {
  return json({ ok: false, error: "The room is busy. Try again in a moment.", retry: true }, 503, {
    "Retry-After": "2",
  });
}

/** Every JSON route answers within 5s. A timeout is a 503 the client can retry. */
export function guarded(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LIMIT_MS);
    const timeout = new Promise<Response>((resolve) => {
      if (ac.signal.aborted) resolve(busy());
      else ac.signal.addEventListener("abort", () => resolve(busy()), { once: true });
    });
    try {
      return await requestSignal.run(ac.signal, async () => {
        try {
          return await Promise.race([handler(req), timeout]);
        } catch (error) {
          const failure = roomFailure(error);
          if (failure) return failure;
          throw error;
        }
      });
    } finally {
      clearTimeout(timer);
    }
  };
}
