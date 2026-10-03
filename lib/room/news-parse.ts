export const REGIONS = ["WORLD", "US", "EUROPE", "ASIA", "MIDDLE EAST", "AFRICA", "AMERICAS", "TECH", "SCIENCE"] as const;
export type Region = (typeof REGIONS)[number];

export type Headline = {
  title: string;
  source: string;
  region: Region;
  summary: string;
  url: string;
  publishedAt: number;
};

const SOURCES = new Set(["BBC", "NPR", "Al Jazeera", "Guardian", "DW", "Living Room"]);

const FEEDS: [string, string][] = [
  ["BBC", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["NPR", "https://feeds.npr.org/1004/rss.xml"],
  ["Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["Guardian", "https://www.theguardian.com/world/rss"],
  ["DW", "https://rss.dw.com/rdf/rss-en-world"],
];

const RULES: [Region, RegExp][] = [
  ["TECH", /\b(tech|software|silicon|chip|startup|cyber|artificial intelligence|\bai\b)\b/i],
  ["SCIENCE", /\b(science|nasa|space|climate|vaccine|species|researchers|study finds)\b/i],
  ["MIDDLE EAST", /\b(gaza|israel|iran|iraq|syria|lebanon|yemen|saudi|qatar|dubai|middle east)/i],
  ["AFRICA", /\b(africa|nigeria|kenya|sudan|ethiopia|congo|somalia|sahel)/i],
  ["EUROPE", /\b(europe|britain|british|france|french|germany|german|ukraine|russia|london|paris|spain|italy|\buk\b|\beu\b|nato)/i],
  ["ASIA", /\b(asia|china|chinese|japan|india|indian|korea|taiwan|beijing|pakistan|philippines)/i],
  ["US", /(?:\bu\.s\.|\b(?:united states|white house|congress|pentagon|washington|new york)\b)/i],
  ["AMERICAS", /\b(mexico|brazil|canada|argentina|colombia|latin america|americas)/i],
];

export function quietWire(): Headline[] {
  return [
    {
      title: "The wire is quiet. The tape will fill when the feeds answer.",
      source: "Living Room",
      region: "WORLD",
      summary: "",
      url: "",
      publishedAt: 0,
    },
  ];
}

export async function gatherNews(): Promise<Headline[]> {
  const batches = await Promise.all(FEEDS.map(([source, url]) => pull(source, url)));
  const merged = batches.flat().sort((a, b) => b.publishedAt - a.publishedAt);
  const kept: Headline[] = [];
  for (const item of merged) {
    if (kept.some((other) => near(other.title, item.title))) continue;
    kept.push(item);
    if (kept.length >= 30) break;
  }
  return kept;
}

export function sanitizeStored(raw: unknown): Headline | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<Headline>;
  return clean({
    title: item.title,
    source: item.source,
    summary: item.summary,
    url: item.url,
    publishedAt: item.publishedAt,
    region: item.region,
  });
}

async function pull(source: string, url: string): Promise<Headline[]> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "LivingRoom/1.0", Accept: "application/rss+xml, application/xml, text/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return [];
    const xml = (await response.text()).slice(0, 420_000);
    if (!/<item\b/i.test(xml)) return [];
    return parseItems(xml, source);
  } catch {
    return [];
  }
}

function parseItems(xml: string, source: string): Headline[] {
  const out: Headline[] = [];
  for (const block of xml.split(/<item\b/i).slice(1, 10)) {
    const headline = clean({
      title: field(block, "title"),
      source,
      summary: field(block, "description") || field(block, "content:encoded").slice(0, 500),
      url: field(block, "link") || field(block, "guid"),
      publishedAt: Date.parse(field(block, "pubDate") || field(block, "dc:date")) || 0,
      region: regionOf(`${field(block, "title")} ${field(block, "description")}`),
    });
    if (headline) out.push(headline);
    if (out.length >= 8) break;
  }
  return out;
}

function field(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match?.[1] ?? "";
}

function clean(item: {
  title?: string;
  source?: string;
  summary?: string;
  url?: string;
  publishedAt?: number;
  region?: string;
}): Headline | null {
  if (!item.source || !SOURCES.has(item.source) || typeof item.title !== "string") return null;
  const title = clip(item.title, 140);
  if (!title) return null;
  const region = REGIONS.includes(item.region as Region) ? (item.region as Region) : "WORLD";
  const summary = clip(item.summary ?? "", 160) ?? "";
  const url = safeUrl(item.url ?? "");
  const publishedAt = typeof item.publishedAt === "number" && Number.isFinite(item.publishedAt) ? item.publishedAt : 0;
  return { title, source: item.source, region, summary, url, publishedAt };
}

function regionOf(text: string): Region {
  const plain = clip(text, 400) ?? "";
  for (const [region, rule] of RULES) if (rule.test(plain)) return region;
  return "WORLD";
}

function near(a: string, b: string) {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const words = left.split(" ").filter((word) => word.length > 3);
  const other = new Set(right.split(" ").filter((word) => word.length > 3));
  if (words.length < 4 || other.size < 4) return false;
  let hit = 0;
  for (const word of words) if (other.has(word)) hit += 1;
  return hit / Math.min(words.length, other.size) >= 0.66;
}

function norm(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function safeUrl(raw: string) {
  const text = clip(raw, 240);
  if (!text || !/^https:\/\/\S+$/i.test(text)) return "";
  return text;
}

function clip(raw: string, max: number): string | null {
  const decoded = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number(code);
      return value > 31 && value < 65536 ? String.fromCodePoint(value) : " ";
    })
    .replace(/[\u0000-\u001F<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!decoded) return null;
  return decoded.length > max ? `${decoded.slice(0, max - 1).trim()}…` : decoded;
}
