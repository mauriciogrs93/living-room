import { ownerJson, sameOrigin } from "@/lib/http";
import { roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { directory } from "@/lib/apartments/directory";
import { ownerContext, withCookies, watchWriteBlock } from "@/lib/apartments/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner: end every watch link and watch session for this apartment. */
export const POST = guarded(async (req) => {
  try {
    const readOnly = await watchWriteBlock(req);
    if (readOnly) return readOnly;
    if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
    const owner = await ownerContext(req);
    if (owner instanceof Response) return owner;
    const ended = await directory().watchRevoke(owner.apartment.id, true);
    return withCookies(ownerJson({ ok: true, message: "Watch links ended.", ...ended }), owner.setCookies);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});
