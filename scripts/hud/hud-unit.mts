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
import { acceptPlayerEvent, watchEmbed, YT_ORIGIN } from "../../lib/room/watch-live";

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
check("watch embed is the nocookie host", embed.startsWith("https://www.youtube-nocookie.com/embed/") && !embed.includes("ytimg") && !embed.includes("www.youtube.com/") && embed.includes("enablejsapi=1"));
check("mute=1 is added only when Room sound is off", watchEmbed(1, { muted: true, origin: "http://127.0.0.1:3921" }).includes("&mute=1") && watchEmbed(1, { muted: true }).includes("enablejsapi=1") && !watchEmbed(1, { muted: false, origin: "http://127.0.0.1:3921" }).includes("mute=1") && watchEmbed(1, { muted: false, origin: "http://127.0.0.1:3921" }).includes("origin="));
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
const savedLineup = { env: process.env.VERCEL_ENV, flag: process.env.NEXT_PUBLIC_FIGURE_LINEUP };
const lineupQuery = "?debug=1&lineup=10";
process.env.VERCEL_ENV = "production";
process.env.NEXT_PUBLIC_FIGURE_LINEUP = "on";
check("production ignores every lineup query", !lineupEnabled() && lineupCount(lineupQuery) === 0 && lineupCount("?debug=1&lineup=1") === 0 && lineupCount("?lineup=4") === 0 && lineupDraws(3, lineupQuery) === 0);
delete process.env.VERCEL_ENV;
process.env.NEXT_PUBLIC_FIGURE_LINEUP = "off";
check("a production bundle flag stays off even if the server env is hidden", lineupCount("?debug=1&lineup=4") === 0);
process.env.VERCEL_ENV = "preview";
process.env.NEXT_PUBLIC_FIGURE_LINEUP = "on";
check("preview still reads the lineup query", lineupCount("?debug=1&lineup=1") === 3 && lineupCount("?debug=1&lineup=4") === 4 && lineupCount("?lineup=10") === 0);
check("a watcher with no agents draws nothing from the lineup", lineupDraws(0, "?debug=1&lineup=10") === 0 && lineupDraws(2, "?debug=1&lineup=10") === 2);
if (savedLineup.env === undefined) delete process.env.VERCEL_ENV;
else process.env.VERCEL_ENV = savedLineup.env;
if (savedLineup.flag === undefined) delete process.env.NEXT_PUBLIC_FIGURE_LINEUP;
else process.env.NEXT_PUBLIC_FIGURE_LINEUP = savedLineup.flag;
const canvasSource = readFileSync(path.join(root, "components/room/room-canvas.tsx"), "utf8");
const lineupSource = readFileSync(path.join(root, "lib/room/lineup.ts"), "utf8");
const nextConfig = readFileSync(path.join(root, "next.config.ts"), "utf8");
check("the canvas does not read lineup on its own", canvasSource.includes("lineupAsked") && !canvasSource.includes('get("lineup")'));
check(
  "production is compiled out of the lineup",
  lineupSource.includes('process.env.VERCEL_ENV === "production"') && nextConfig.includes('NEXT_PUBLIC_FIGURE_LINEUP: process.env.VERCEL_ENV === "production" ? "off" : "on"'),
);
check("icons are bundled SVG components", iconSource.includes("<path") && !iconSource.includes("dangerouslySetInnerHTML") && !iconSource.includes("innerHTML"));
check("player commands never use a wildcard target", frameSource.includes("YT_ORIGIN") && !frameSource.includes("'*'") && !frameSource.includes('"*"'));

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length}`);
if (failed) process.exit(1);
