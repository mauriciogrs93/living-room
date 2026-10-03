import { OWNER_COOKIE, OWNER_KEY_RE, ownerJson, ownerKeyFrom, readJson, sameOrigin } from "@/lib/http";
import { getEngine, roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AGE = 30 * 24 * 60 * 60;

function cookie(value: string, maxAge: number) {
  return `${OWNER_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Is there an owner session, and does it open the Door? Never echoes the key. */
export const GET = guarded(async (req) => {
  try {
    const ownerKey = ownerKeyFrom(req);
    if (!ownerKey) return ownerJson({ ok: true, signedIn: false, door: false });
    const view = await getEngine().doorBrief(ownerKey);
    return ownerJson({ ok: true, signedIn: true, door: Boolean(view) });
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

/** One-time bootstrap: the ?owner= link value is posted here once and moved into an HttpOnly cookie. */
export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const raw = body.value && typeof body.value === "object" ? (body.value as { ownerKey?: unknown }).ownerKey : "";
  const ownerKey = typeof raw === "string" ? raw.trim() : "";
  if (!OWNER_KEY_RE.test(ownerKey)) return ownerJson({ ok: false, error: "This page needs the owner link from your agent." }, 401);
  return ownerJson({ ok: true }, 200, { "Set-Cookie": cookie(ownerKey, MAX_AGE) });
});

export const DELETE = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  return ownerJson({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
});
