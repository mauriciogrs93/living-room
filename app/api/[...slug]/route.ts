import { json, preflight } from "@/lib/http";
import { guarded } from "@/lib/room/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function missing() {
  return json({ ok: false, error: "No such API route." }, 404);
}

export const GET = guarded(async () => missing());
export const POST = guarded(async () => missing());
export const PUT = guarded(async () => missing());
export const PATCH = guarded(async () => missing());
export const DELETE = guarded(async () => missing());

export function OPTIONS() {
  return preflight();
}
