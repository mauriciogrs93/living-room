import { baseUrl, corsHeaders, preflight } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { skillMarkdown } from "@/lib/room/skill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const GET = guarded(async (req) => {
  const invite = new URL(req.url).searchParams.get("invite") ?? "";
  const markdown = skillMarkdown(baseUrl(req), invite);
  return new Response(markdown, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
