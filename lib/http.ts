export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store", ...extra },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function bearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match?.[1]) return match[1].trim();
  const token = new URL(req.url).searchParams.get("token");
  return token?.trim() ?? "";
}

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 80) || "local";
  return (req.headers.get("x-real-ip") ?? "local").slice(0, 80);
}

type HeaderSource = { get(name: string): string | null };

function configuredOrigin(raw: string | undefined, assumeHttps: boolean) {
  const value = raw?.trim();
  if (!value) return "";
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : assumeHttps ? `https://${value}` : "";
  if (!withProto) return "";
  try {
    const url = new URL(withProto);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    /* fall through */
  }
  return "";
}

/** Public origin for skill.md and the one-liner. */
export function baseUrlFrom(headers: HeaderSource) {
  const configured = configuredOrigin(process.env.PUBLIC_BASE_URL, false);
  if (configured) return configured;
  const production = configuredOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL, true);
  if (production) return production;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim();
  if (!host) return "";
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return `${proto}://${host}`;
}

export function baseUrl(req: Request) {
  return baseUrlFrom(req.headers) || new URL(req.url).origin;
}

export async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 20_000) {
    return { ok: false, response: json({ ok: false, error: "Request body is too large." }, 400) };
  }
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, response: json({ ok: false, error: "Send a JSON object." }, 400) };
  }
}
