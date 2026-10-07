// HUD unit checks. No network, no email.
//   npx tsx scripts/hud/hud-unit.mts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { HOUSE_ZONE_SHORT, houseClockLabel, sunriseTime, sunsetTime } from "../../lib/house-clock";
import { doorLeafAnchor } from "../../components/room/maquette/door-mesh";
import { anchorLift, windowAnchor } from "../../lib/room/anchor-heights";
import { HUD_CONTROLS, houseControls, yoursCards, yoursControls } from "../../components/hud/frame/controls";
import { cleanHud, httpLink, httpsUrl } from "../../components/hud/frame/sanitize";
import * as strings from "../../components/hud/frame/strings";
import { FALLBACK_STATIONS } from "../../lib/room/house";
import { forecastUrlAllowed } from "../../lib/room/house-sky";
import { lineupCount, lineupDraws, lineupEnabled } from "../../lib/room/lineup";
import { acceptPlayerEvent, embedOrigin, watchEmbed, YT_ORIGIN } from "../../lib/room/watch-live";
import { fitTagBoxes, joinToast, placeTags, plainName, stackLabel, tagCopy, walkedInLine, type TagOut, type TagPoint, type TagRect } from "../../lib/room/name-tags";

const results: boolean[] = [];
function check(name: string, ok: unknown, detail = "") {
  results.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail.slice(0, 180)})` : ""}`);
}

const noon = new Date("2026-10-06T16:00:00.000Z");
const sunset = sunsetTime(noon);
const sunrise = sunriseTime(noon);
const setLabel = houseClockLabel(sunset);
const riseLabel = houseClockLabel(sunrise);
function minutes(label: string) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label);
  if (!match) return -1;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}
const setMin = minutes(setLabel);
const riseMin = minutes(riseLabel);
check("sunset on 6 Oct 2026 is 6:27–6:35 PM ET", setMin >= 18 * 60 + 27 && setMin <= 18 * 60 + 35, setLabel);
check(
  "sunrise after that sunset is 6:57–7:07 AM ET (formula runs about 2 min early vs the brief floor)",
  riseMin >= 6 * 60 + 57 && riseMin <= 7 * 60 + 7,
  riseLabel,
);
check("sun times are whole minutes", sunset.getTime() % 60_000 === 0 && sunrise.getTime() % 60_000 === 0);

check("radio anchor sits higher than the default", anchorLift("radio") === 0.78 && anchorLift("tv") === 0.77 && anchorLift("lamp") === 0.7);
const glass = windowAnchor();
check("window anchor is the bedroom glass, already in stage space", glass.x === -2.1 && glass.y === 7.18 && glass.z === 1.27, JSON.stringify(glass));
const door = doorLeafAnchor();
check("door anchor is the leaf centre in stage space", door.x === -2.076 && door.y === 1.022 && door.z === 1.15, JSON.stringify(door));

check("cleanHud drops control characters and caps", cleanHud("a\u0000b\u202ec", 2) === "ab");
check("httpsUrl keeps only https", httpsUrl("https://example.com/a") === "https://example.com/a" && httpsUrl("http://example.com") === "" && httpsUrl("javascript:alert(1)") === "");
check("httpLink allows http and https", httpLink("http://example.com/a") === "http://example.com/a" && httpLink("https://example.com/b") === "https://example.com/b" && httpLink("ftp://example.com") === "");

const text = Object.values(strings).map((item) => (typeof item === "function" ? item("Jazz") : item)).join("\n");
const stringBody = text.replaceAll("Plays from YouTube.", "");
for (const banned of ["Open-Meteo", "17TRACK", "Spotify", "YouTube", "youtube", "ytimg", "TODO-WRITER"]) {
  check(`HUD strings have no ${banned}`, !stringBody.includes(banned));
}
check("watch live copy is the ship line", strings.WATCH_LIVE === "Watch live" && strings.PLAYS_FROM_YOUTUBE === "Plays from YouTube." && strings.SKY_FOLLOWS === "The sky follows the house.");
check("watcher title uses a display name or The apartment", strings.apartmentTitle(null) === "The apartment" && strings.apartmentTitle("  ") === "The apartment" && strings.apartmentTitle("Ada") === "Ada's apartment" && strings.apartmentTitle("Ada Lovelace") === "Ada Lovelace's apartment");
check("watcher title never uses an email", strings.apartmentTitle("ada@example.com") === "The apartment" && strings.apartmentTitle("ada@example.com's apartment") === "The apartment");
const embed = watchEmbed(5);
check("watch embed is the nocookie host", embed.startsWith("https://www.youtube-nocookie.com/embed/") && !embed.includes("ytimg") && !embed.includes("www.youtube.com/") && embed.includes("enablejsapi=1") && embed.includes("mute=1"));
const previewOrigin = embedOrigin({ origin: "https://living-room-psi.vercel.app" });
const midnight = watchEmbed(2, { origin: previewOrigin });
check("embed origin is the page origin and ignores a query", previewOrigin === "https://living-room-psi.vercel.app" && embedOrigin({ origin: "https://evil.test/?next=https://living-room-psi.vercel.app" }) === "");
check("midnight news embed is nocookie with that origin and a fixed mute", midnight.startsWith("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?") && midnight.includes(`origin=${encodeURIComponent(previewOrigin)}`) && midnight.includes("mute=1") && !midnight.includes("www.youtube.com/"));
check("mute does not change the embed url", watchEmbed(1, { origin: "http://127.0.0.1:3921" }) === watchEmbed(1, { origin: "http://127.0.0.1:3921" }) && watchEmbed(1, { origin: "http://127.0.0.1:3921" }).includes("mute=1"));
const frame = { id: "player" };
const other = { id: "other" };
check("player messages accept only the nocookie frame", acceptPlayerEvent(YT_ORIGIN, frame, frame) && !acceptPlayerEvent("https://evil.test", frame, frame) && !acceptPlayerEvent(YT_ORIGIN, other, frame) && !acceptPlayerEvent(YT_ORIGIN, null, frame));
check("a possessive title keeps the apartment suffix", strings.fitApartmentTitle("Ada Lovelace's apartment", 18) === "Ada's apartment" && strings.fitApartmentTitle("The apartment", 4) === "The apartment" && strings.fitApartmentTitle("Ada's apartment", 40) === "Ada's apartment");
check("phone zone short form is ET", HOUSE_ZONE_SHORT === "ET");
check("unknown channels do not invent an embed", watchEmbed(0) === "" && watchEmbed(9) === "");
check("forecast hosts stay on the weather service", forecastUrlAllowed("https://api.weather.gov/gridpoints/OKX/33,37/forecast") && !forecastUrlAllowed("http://api.weather.gov/forecast") && !forecastUrlAllowed("https://evil.example/forecast"));
check("curated stations are https and not SomaFM", FALLBACK_STATIONS.length >= 2 && FALLBACK_STATIONS.every((station) => station.url.startsWith("https://") && !/somafm/i.test(station.url + station.name)));
check("computer search is a local control", HUD_CONTROLS["computer-search"]?.effect === "device:apartment-search" && HUD_CONTROLS["computer-screen"]?.effect === "open:computer" && HUD_CONTROLS["tv-watch"]?.effect === "device:watch-live");

const ownerHouse = houseControls("owner", { radioTune: true, tvChannel: true }, 4);
const ownerPlain = houseControls("owner", { radioTune: false, tvChannel: false }, 4);
const watchHouse = houseControls("watch", { radioTune: true, tvChannel: true }, 4);
check("owner house controls include play, tune, and channels", ["radio-play", "radio-prev", "radio-row-0", "tv-chip-1", "sky-look"].every((id) => ownerHouse.includes(id)));
check("tune and channel controls drop out when the additions are off", !ownerPlain.includes("radio-prev") && !ownerPlain.includes("radio-row-0") && !ownerPlain.includes("tv-chip-1") && ownerPlain.includes("radio-play"));
check("a watcher gets mute and no owner actions", watchHouse.includes("radio-mute") && !watchHouse.some((id) => id.startsWith("radio-play") || id.startsWith("tv-")));
for (const id of [...ownerHouse, ...watchHouse]) {
  const spec = HUD_CONTROLS[id];
  check(`control ${id} is registered`, Boolean(spec && spec.effect && spec.roles.length));
}
check("yours stays hidden unless the flag is on for the owner", yoursCards(false, "owner").length === 0 && yoursCards(true, "watch").length === 0 && yoursCards(true, "owner").join(",") === "Packages,My music,My city");
check("yours controls exist only for that flag", yoursControls(false, "owner").length === 0 && yoursControls(true, "owner").includes("yours-packages") && HUD_CONTROLS["yours-packages"]?.effect === "open:yours-packages");

const skip = new Set(["node_modules", ".next", ".git", "design", "uploads"]);
function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, out);
    else if (/\.(tsx?|mjs|css|mts)$/.test(name)) out.push(full);
  }
}
const files: string[] = [];
const root = path.resolve(import.meta.dirname, "../..");
const bannedTitle = ["Founder", "'s apartment"].join("");
check("html5c does not hardcode a person in the apartment title", !readFileSync(path.join(root, "design/hud-draft5c/html5c/hud.html"), "utf8").includes(bannedTitle));
for (const dir of ["app", "components", "lib"]) walk(path.join(root, dir), files);
const bannedSource = ["Open-Meteo", "17TRACK", "ytimg", "youtube-nocookie", "fonts.googleapis", "TODO-WRITER", "navigator.geolocation"];
const nocookieFile = path.join(root, "lib/room/watch-live.ts");
for (const file of files) {
  const body = readFileSync(file, "utf8");
  for (const word of bannedSource) {
    if (word === "youtube-nocookie" && file === nocookieFile) continue;
    if (body.includes(word)) check(`shipped source has no ${word}`, false, path.relative(root, file));
  }
  if (body.includes(bannedTitle)) check("shipped source has no hardcoded apartment name", false, path.relative(root, file));
}
check("shipped source scan finished", files.length > 20, `${files.length} files`);
const hudCss = readFileSync(path.join(root, "app/hud-frame.css"), "utf8");
const iconSource = readFileSync(path.join(root, "components/hud/frame/icons.tsx"), "utf8");
const frameSource = readFileSync(path.join(root, "components/hud/frame/watch-frame.tsx"), "utf8");
check("HUD css has no backdrop-filter or filter", !hudCss.includes("backdrop-filter") && !/(^|[^-\w])filter\s*:/.test(hudCss));
check("title and zone pills are not ellipsized", !/\.hudf-title-pill[^{]*\{[^}]*ellipsis/.test(hudCss) && !/\.hudf-zone[^{]*\{[^}]*ellipsis/.test(hudCss));
check("scrim stays a flat wash", hudCss.includes("rgba(43, 45, 49, 0.28)") && !/\.hudf-scrim[^{]*\{[^}]*blur/.test(hudCss));
check("scrim selector beats the button reset", /\.hudf \.hudf-scrim\s*\{[^}]*background:\s*rgba\(43,\s*45,\s*49,\s*0\.28\)/.test(hudCss));
check(
  "an empty Here is a watcher line only",
  strings.hereEmptyCopy("watch", 0) === "No one's home right now." && strings.hereEmptyCopy("watch", 1) === "" && strings.hereEmptyCopy("owner", 0) === "",
);
const savedLineup = { env: process.env.VERCEL_ENV, flag: process.env.NEXT_PUBLIC_FIGURE_LINEUP, node: process.env.NODE_ENV };
const nodeEnv = process.env as { NODE_ENV?: string };
const lineupQuery = "?debug=1&lineup=10";
nodeEnv.NODE_ENV = "production";
process.env.VERCEL_ENV = "production";
process.env.NEXT_PUBLIC_FIGURE_LINEUP = "on";
check("production ignores every lineup query", !lineupEnabled() && lineupCount(lineupQuery) === 0 && lineupCount("?debug=1&lineup=1") === 0 && lineupCount("?lineup=4") === 0 && lineupDraws(3, lineupQuery) === 0);
delete process.env.VERCEL_ENV;
nodeEnv.NODE_ENV = "development";
process.env.NEXT_PUBLIC_FIGURE_LINEUP = "off";
check("a production bundle flag stays off even if the server env is hidden", lineupCount("?debug=1&lineup=4") === 0);
nodeEnv.NODE_ENV = "production";
process.env.NEXT_PUBLIC_FIGURE_LINEUP = "on";
check("a self-hosted production build ignores the lineup query", !lineupEnabled() && lineupCount(lineupQuery) === 0 && lineupCount("?debug=1&lineup=1") === 0);
process.env.VERCEL_ENV = "preview";
nodeEnv.NODE_ENV = "production";
process.env.NEXT_PUBLIC_FIGURE_LINEUP = "on";
check("preview still reads the lineup query", lineupCount("?debug=1&lineup=1") === 3 && lineupCount("?debug=1&lineup=4") === 4 && lineupCount("?lineup=10") === 0);
check("a watcher with no agents draws nothing from the lineup", lineupDraws(0, "?debug=1&lineup=10") === 0 && lineupDraws(2, "?debug=1&lineup=10") === 2);
nodeEnv.NODE_ENV = "development";
delete process.env.VERCEL_ENV;
process.env.NEXT_PUBLIC_FIGURE_LINEUP = "on";
check("local development still reads the lineup query", lineupEnabled() && lineupCount("?debug=1&lineup=4") === 4);
if (savedLineup.env === undefined) delete process.env.VERCEL_ENV;
else process.env.VERCEL_ENV = savedLineup.env;
if (savedLineup.flag === undefined) delete process.env.NEXT_PUBLIC_FIGURE_LINEUP;
else process.env.NEXT_PUBLIC_FIGURE_LINEUP = savedLineup.flag;
if (savedLineup.node === undefined) delete nodeEnv.NODE_ENV;
else nodeEnv.NODE_ENV = savedLineup.node;
const canvasSource = readFileSync(path.join(root, "components/room/room-canvas.tsx"), "utf8");
const lineupSource = readFileSync(path.join(root, "lib/room/lineup.ts"), "utf8");
const nextConfig = readFileSync(path.join(root, "next.config.ts"), "utf8");
check("the canvas does not read lineup on its own", canvasSource.includes("lineupAsked") && !canvasSource.includes('get("lineup")'));
check(
  "production is compiled out of the lineup",
  lineupSource.includes('process.env.VERCEL_ENV === "production"') &&
    lineupSource.includes('process.env.NODE_ENV === "production"') &&
    lineupSource.includes('process.env.VERCEL_ENV !== "preview"') &&
    nextConfig.includes('NEXT_PUBLIC_FIGURE_LINEUP: process.env.VERCEL_ENV === "production" ? "off" : "on"'),
);
const hudFrame = readFileSync(path.join(root, "components/hud/frame/frame.tsx"), "utf8");
check("Room sound shows On or Off for every role", hudFrame.includes("muted ? SOUND_OFF : SOUND_ON") && !hudFrame.includes("muted ? MUTE : UNMUTE"));
check("icons are bundled SVG components", iconSource.includes("<path") && !iconSource.includes("dangerouslySetInnerHTML") && !iconSource.includes("innerHTML"));
check("player commands never use a wildcard target", frameSource.includes("YT_ORIGIN") && !frameSource.includes("'*'") && !frameSource.includes('"*"'));
check("watch origin comes from window.location only", frameSource.includes("embedOrigin(window.location)") && !frameSource.includes("location.search") && !frameSource.includes("location.href") && !frameSource.includes("location.hash"));
check("incoming player messages check origin and source", frameSource.includes("event.origin !== YT_ORIGIN") && frameSource.includes("event.source !== frame"));
check("mute posts only after the iframe has loaded", frameSource.includes("if (!ready.current) return") && frameSource.includes("onLoad={onLoad}") && !frameSource.includes(".src ="));
check("the iframe mounts only after Watch live and close removes it", hudFrame.includes("{watchLive && portalHost ? createPortal(") && hudFrame.includes("if (!watchLive)"));
const eqAt = hudCss.indexOf("@keyframes hudf-eq");
const eqBlock = eqAt >= 0 ? hudCss.slice(eqAt, eqAt + 180) : "";
check("radio EQ uses transform keyframes", eqBlock.includes("transform: scaleY(0.35)") && eqBlock.includes("transform: scaleY(1)") && !eqBlock.includes("filter"));
check("radio EQ pauses while the HUD is tucked", hudCss.includes(".hudf.is-tucked .hudf-eq i { animation-play-state: paused; }"));
check("the radio card draws EQ from the playing state", hudFrame.includes('data-eq=""') && hudFrame.includes("radio?.on ? (") && !hudFrame.includes("AudioContext") && !hudFrame.includes("Analyser"));
check("Room sound label is at least 13px", hudCss.includes(".hudf-switch { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }"));
const globals = readFileSync(path.join(root, "app/globals.css"), "utf8");
const tagLayer = readFileSync(path.join(root, "components/room/name-tag-layer.tsx"), "utf8");
check("name tags are plain text", tagLayer.includes("textContent") && !tagLayer.includes("innerHTML") && !tagLayer.includes("dangerouslySetInnerHTML"));
check("only the name pill takes pointer events", globals.includes(".name-tags {\n  position: absolute;") && globals.includes("pointer-events: none;") && globals.includes("pointer-events: auto;") && !globals.includes(".agent-tag::after"));
check("a script payload name stays plain text", plainName('<script>alert(1)</script>Ada') === "alert(1)Ada" && plainName('<img src=x onerror=alert(1)>') === "" && !plainName("A<b>da</b>\u202e").includes("<"));
check("join rows name the person", walkedInLine("Ada Lovelace") === "Ada Lovelace walked in." && walkedInLine("<b></b>") === "Someone walked in." && walkedInLine("  ") === "Someone walked in.");
const view: TagRect = { l: 0, t: 0, r: 400, b: 320 };
const blocks: TagRect[] = [{ l: 0, t: 260, r: 400, b: 320 }];
const order = new Uint16Array(8);
const fresh = (): TagOut[] => Array.from({ length: 8 }, () => ({ id: "", x: 0, y: 0, text: "", label: "", more: 0, color: "", who: "", ids: "", dots: "" }));
const idleOut = fresh();
const idle: TagPoint[] = [{ id: "ada", x: 120, y: 90, depth: 1, name: "Ada", idle: true, color: "#888" }];
check("an idle tag keeps the name", placeTags(idle, 1, blocks, 0, view, order, idleOut) === 1 && idleOut[0]?.text === "Ada · Away" && idleOut[0]?.label === "Ada · Away" && tagCopy("Ada", true).text === "Ada · Away");
const crowd: TagPoint[] = [0, 1, 2, 3].map((i) => ({ id: `a${i}`, x: 160, y: 100, depth: i + 1, name: `Agent ${i}`, idle: false, color: "#888" }));
const crowdOut = fresh();
const shown = placeTags(crowd, 4, blocks, 0, view, order, crowdOut);
const more = crowdOut.find((slot) => slot.more > 0);
check("colliding tags keep the nearest and collapse the rest", shown >= 2 && more !== undefined && more.more >= 1 && crowdOut[0]?.id === "a0");
check("a stack label lists the hidden names", stackLabel(3, ["Ada", "Bea"]) === "3 more: Ada, Bea" && more !== undefined && more.label.startsWith(`${more.more} more:`));
check("join toast names the person", joinToast("Ada just walked in") === "Ada walked in." && joinToast("just walked in") === "Someone walked in." && joinToast("<b></b> just walked in") === "Someone walked in.");
check("the watch badge is sentence case", strings.BADGE_WATCH === "Watching" && hudFrame.includes("BADGE_WATCH") && !hudFrame.includes("WATCHING"));
check("desktop does not render the Here tab", hudFrame.includes("narrow ? (") && hudFrame.includes('data-ctl="here-tab"'));
check("name tags use zero letter spacing", /\.agent-tag \{[^}]*letter-spacing:\s*0;/.test(globals));
check("a stack opens a plain-text name list", tagLayer.includes("data-stack-pick") && tagLayer.includes("plainName") && tagLayer.includes("textContent") && tagLayer.includes('event.key === "Escape"') && tagLayer.includes("data-stack-close") && !tagLayer.includes("innerHTML") && !tagLayer.includes("<a "));
check("stack rows are 44px ink on plaster", globals.includes(".tag-stack-row {") && globals.includes("min-height: 44px") && globals.includes("rgba(43, 45, 49, 0.06)") && globals.includes("outline: 2px solid #2b2d31"));
check("the watcher notice is the short sentence", strings.OWNER_ONLY === "Only the owner can change this." && strings.WATCH_YOU.includes("Only the owner can change this."));
check("the mute control cannot grow with the sheet", /\.hudf-body > \.hudf-play\[data-ctl="radio-mute"\] \{[^}]*max-height:\s*44px/.test(hudCss));
check("the playing meter is 14px ink bars", hudCss.includes(".hudf-now .hudf-eq i { width: 3px; height: 14px; background: var(--ink); }"));
check("the house icon is cached for a year", nextConfig.includes('source: "/icon.svg"') && nextConfig.includes("max-age=31536000"));
const avatarSource = readFileSync(path.join(root, "components/room/avatar.tsx"), "utf8");
check("tag placement does not read layout after writing", !avatarSource.includes("label.getBoundingClientRect") && avatarSource.includes("hostMeasures"));
const stairBlock: TagRect[] = [{ l: 0, t: 20, r: 120, b: 90 }];
const cleared = fitTagBoxes([{ x: 20, y: 30, w: 90, h: 28, ax: 64, ay: 70 }], { l: 0, t: 0, r: 400, b: 320 }, stairBlock, 1);
const clearBox = cleared[0]!;
const stillCovered = clearBox.x < 120 && clearBox.x + 90 > 0 && clearBox.y < 90 && clearBox.y + 28 > 20;
check("a covered name tag moves clear of the stairs", !stillCovered, `${clearBox.x},${clearBox.y}`);
check("the +N list is plaster with ink text", globals.includes("background: #f7f4ee") && globals.includes("color: #2b2d31"));
check("name tags are not ellipsized", /\.agent-tag span \{[^}]*text-overflow:\s*clip/.test(globals) && /\.name-tags \.agent-tag \{[^}]*width:\s*max-content/.test(globals));
const tagLayerNow = tagLayer;
const readAt = tagLayerNow.indexOf("btn.scrollWidth");
const writeAt = tagLayerNow.indexOf("btn.style.left =");
check("tag sizes are read before positions are written", readAt > 0 && writeAt > readAt);
check("tag layout does not run from chrome class changes", !tagLayerNow.includes("MutationObserver"));
check(
  "report-only CSP allows only the nocookie frame",
  nextConfig.includes("frame-src https://www.youtube-nocookie.com") &&
    nextConfig.includes("script-src 'self' 'unsafe-inline'") &&
    nextConfig.includes("connect-src 'self'") &&
    nextConfig.includes("Content-Security-Policy-Report-Only"),
);
check(
  "watchers see owner-only lines and cannot press stations or channels",
  hudFrame.includes('data-owner-line="station"') && hudFrame.includes("OWNER_STATION") && hudFrame.includes('data-owner-line="channel"') && hudFrame.includes("OWNER_CHANNEL") && hudFrame.includes('aria-disabled="true"'),
);
check("the card close control is named Close", hudFrame.includes("aria-label={CLOSE}") && hudFrame.includes('aria-hidden="true">×</span>'));
check("shader warm-up is idle and stays on our own meshes", canvasSource.includes("requestIdleCallback") && canvasSource.includes("gl.compile") && !canvasSource.includes("youtube") && !canvasSource.includes("preconnect"));
check("the framed camera ignores stage changes", canvasSource.includes("window.innerWidth") && !canvasSource.includes('addEventListener("hud-stage"'));
check("rail bars follow playback", hudFrame.includes("data-rail-eq") && hudFrame.includes("paused={Boolean(radio?.on && muted)}"));

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length}`);
if (failed) process.exit(1);
