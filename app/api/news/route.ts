import { json, preflight } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { ensureNews, peekTape } from "@/lib/room/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const GET = guarded(getNews);

async function getNews() {
  await ensureNews();
  const items = peekTape().map((item) => ({
    title: item.title,
    source: item.source,
    region: item.region,
    summary: item.summary,
    url: item.url,
    publishedAt: item.publishedAt,
  }));
  return json({ ok: true, items });
}
