import { confirmSignIn } from "@/lib/apartments/confirm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return confirmSignIn(req);
}
