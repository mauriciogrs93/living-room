// HUD unit checks. No network, no email.
//   npx tsx scripts/hud/hud-unit.mts
import "./css-stub.mts";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { HOUSE_ZONE_SHORT, houseClockLabel, sunriseTime, sunsetTime } from "../../lib/house-clock";
import { doorLeafAnchor } from "../../components/room/maquette/door-mesh";
import { anchorLift, windowAnchor } from "../../lib/room/anchor-heights";
import { HUD_CONTROLS, houseControls, yoursCards, yoursControls } from "../../components/hud/frame/controls";
import { cleanHud, httpLink, httpsUrl } from "../../components/hud/frame/sanitize";
import * as strings from "../../components/hud/frame/strings";
import { FALLBACK_STATIONS } from "../../lib/room/house";
import { forecastUrlAllowed, houseSky, HOUSE_CELL, pointsUrl, previewSky, resetHouseSkyCache, roundCell, skyBody, skyCellFromHeaders } from "../../lib/room/house-sky";
import { lineupCount, lineupDraws, lineupEnabled } from "../../lib/room/lineup";
import { acceptPlayerEvent, embedOrigin, readPlayerSignal, watchEmbed, YT_ORIGIN } from "../../lib/room/watch-live";
import { fitTagBoxes, joinToast, placeTags, plainName, stackLabel, stackListBox, stackRowCopy, tagCopy, walkedInLine, type TagOut, type TagPoint, type TagRect } from "../../lib/room/name-tags";
import { orderAgents } from "../../lib/room/activity-pin";
import { STATIONS, stationUrl } from "../../lib/room/fixed-stations";
import { createRadioPlayback, type RadioSink } from "../../lib/room/radio-playback";
import { connectRadio, noteRadioServer, playFromCard, pressMutePill, roomSoundOff, setRoomSoundOff } from "../../components/room/ambience";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AmbienceContext, HudFrame, type AmbienceValue } from "../../components/hud/frame/frame";
import type { HudModel } from "../../components/hud/model";
import type { LiveSnapshot } from "../../components/use-room";
import { deviceMuted, mutePillIcon, mutePillLabel, mutePillMayUnmute, mutePillVisible, playingLineVisible, RADIO_CONTROLS, radioControlLabel, roomSoundStoredOff, stationRowMayUnmute } from "../../lib/room/room-sound";
import * as THREE from "three";
import { closeUpZoomQuery, fitCamera, hudSafeRect, projectedHull, setCloseUp } from "../../components/room/frame-zoom";

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
check("watch embed is the nocookie host", embed.startsWith("https://www.youtube-nocookie.com/embed/") && !embed.includes("ytimg") && !embed.includes("www.youtube.com/") && embed.includes("enablejsapi=1") && embed.includes("autoplay=1") && embed.includes("mute=1") && embed.includes("playsinline=1"));
check("a playing signal is state 1 and an error is not a hand-off", readPlayerSignal('{"event":"infoDelivery","info":{"playerState":1}}').state === 1 && readPlayerSignal({ event: "onError", info: 150 }).error && !readPlayerSignal({ event: "onStateChange", info: -1 }).error);
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
check("Room sound shows On or Off for every role", hudFrame.includes("soundOff ? SOUND_OFF : SOUND_ON") && !hudFrame.includes("muted ? MUTE : UNMUTE"));
check("icons are bundled SVG components", iconSource.includes("<path") && !iconSource.includes("dangerouslySetInnerHTML") && !iconSource.includes("innerHTML"));
check("player commands never use a wildcard target", frameSource.includes("YT_ORIGIN") && !frameSource.includes("'*'") && !frameSource.includes('"*"'));
check("watch origin comes from window.location only", frameSource.includes("embedOrigin(window.location)") && !frameSource.includes("location.search") && !frameSource.includes("location.href") && !frameSource.includes("location.hash"));
check("incoming player messages check origin and source", frameSource.includes("event.origin !== YT_ORIGIN") && frameSource.includes("event.source !== frame"));
check("mute posts only after the iframe has loaded", frameSource.includes("if (!ready.current || !muted) return") && frameSource.includes("onLoad={onLoad}") && !frameSource.includes(".src =") && !frameSource.includes("unMute"));
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
const fresh = (): TagOut[] => Array.from({ length: 8 }, () => ({ id: "", x: 0, y: 0, text: "", label: "", more: 0, color: "", who: "", ids: "", dots: "", away: "" }));
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
check("a stack opens a plain-text name list", tagLayer.includes("data-stack-pick") && tagLayer.includes("stackRowCopy") && tagLayer.includes("label.textContent = text") && tagLayer.includes('event.key === "Escape"') && tagLayer.includes("data-stack-close") && !tagLayer.includes("innerHTML") && !tagLayer.includes("<a "));
check("stack rows are 44px ink on plaster", globals.includes(".tag-stack-row {") && globals.includes("min-height: 44px") && globals.includes("rgba(43, 45, 49, 0.06)") && globals.includes("outline: 2px solid #2b2d31") && globals.includes("scrollbar-width: none") && globals.includes("mask-image: linear-gradient") && !globals.includes(".tag-stack-scroll { filter"));
const tall = stackListBox(400, 40, []);
const blocked = stackListBox(400, 40, [{ top: 200, bottom: 244 }]);
const below = stackListBox(400, 40, [{ top: 460, bottom: 504 }]);
check("a tall stack caps at five rows above the pill", tall.maxHeight === 5 * 44 + 36 && tall.top === 400 - tall.maxHeight && tall.bottom === 400);
check("a stack leaves 8px under chrome that sits above the pill", blocked.maxHeight === 400 - 252 && blocked.top === 252 && blocked.bottom === 400);
check("chrome below the pill does not shrink the upward list", below.maxHeight === tall.maxHeight && below.bottom === 400);
const awayRow = stackRowCopy("Ada <b>Lovelace</b>", true);
check("an away stack row is plain text", awayRow === "Ada Lovelace · Away" && stackRowCopy("Ada", false) === "Ada" && !awayRow.includes("<"));
const piled: TagPoint[] = [
  { id: "near", x: 80, y: 80, depth: 1, name: "Near", idle: false, color: "#888" },
  { id: "far", x: 82, y: 82, depth: 9, name: "Bea", idle: true, color: "#888" },
];
const piledOut = fresh();
placeTags(piled, 2, blocks, 0, view, order, piledOut);
const pile = piledOut.find((slot) => slot.more > 0);
check("an away person folded into +N keeps the flag", pile !== undefined && pile.away.split("\n").includes("1") && stackRowCopy("Bea", true) === "Bea · Away");
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
check(
  "shader warm-up compiles only the selection ring",
  canvasSource.includes("compileAsync") &&
    canvasSource.includes("KHR_parallel_shader_compile") &&
    canvasSource.includes('mesh.name !== "selection-ring"') &&
    canvasSource.includes("gl.compile") &&
    !canvasSource.includes("requestIdleCallback") &&
    !canvasSource.includes("youtube") &&
    !canvasSource.includes("preconnect") &&
    avatarSource.includes('name="selection-ring"') &&
    avatarSource.includes("tapReady"),
);
check("the framed camera ignores stage changes", canvasSource.includes("window.innerWidth") && !canvasSource.includes('addEventListener("hud-stage"'));
check("rail bars follow playback", hudFrame.includes("data-rail-eq") && hudFrame.includes("paused={!hearing}"));
check(
  "the Today dot hides while any panel is open, including Activity",
  hudFrame.includes("dot={dot && !shown}") && hudCss.includes(".hudf.is-sheet .hudf-dot { display: none; visibility: hidden; transition: none; }"),
);
check(
  "watch live retries in the same nocookie frame",
  frameSource.includes('allow="autoplay; encrypted-media; picture-in-picture"') &&
    frameSource.includes('referrerPolicy="strict-origin-when-cross-origin"') &&
    watchEmbed(3, { origin: "http://127.0.0.1:3921" }).includes("playsinline=1") &&
    frameSource.includes('playerCommand("playVideo")') &&
    frameSource.includes("WATCH_PLAY_LABEL") &&
    frameSource.includes("WATCH_CANT_PLAY") &&
    strings.WATCH_PLAY_LABEL === "Play video" &&
    strings.WATCH_CANT_PLAY === "This video can't play here." &&
    strings.PLAY === "Play" &&
    !frameSource.includes("www.youtube.com") &&
    !frameSource.includes("<a ") &&
    !frameSource.includes("fullscreen") &&
    !frameSource.includes("unMute"),
);
const ambienceSource = readFileSync(path.join(root, "components/room/ambience.tsx"), "utf8");
const activitySource = readFileSync(path.join(root, "components/hud/sections/activity.tsx"), "utf8");
check(
  "a station change never unmutes or turns Room sound on",
  stationRowMayUnmute(false, "station-row") === false &&
    stationRowMayUnmute(true, "station-row") === false &&
    stationRowMayUnmute(false, "remote") === false &&
    stationRowMayUnmute(true, "remote") === false,
);
check(
  "the station row does not start audio and follow ignores a room URL",
  hudFrame.includes('onClick={() => tapRadio("tune", index)}') &&
    !hudFrame.includes("unmuteFromStationTap") &&
    !ambienceSource.includes("snapshot.radio.url") &&
    !ambienceSource.includes("snapshot?.radio.url") &&
    ambienceSource.includes("playback?.follow(snapshot.radio.index)") &&
    !frameSource.includes("unMute"),
);
check(
  "activity closes with the shared × control",
  activitySource.includes("aria-label={CLOSE}") && activitySource.includes('aria-hidden="true">×</span>') && !activitySource.includes(">Close<") && activitySource.includes("uniqueAgents"),
);
check(
  "name tags stack above the canvas",
  globals.includes("z-index: 5;") &&
    globals.includes("overflow: visible;") &&
    /\.room-stage canvas \{[\s\S]*?z-index: 0;/.test(globals) &&
    !globals.includes("translateZ(0)") &&
    globals.includes("mask-image: linear-gradient") &&
    !globals.includes(".tag-stack-scroll { filter") &&
    !globals.includes(".tag-stack-scroll.is-overflow {\n  filter"),
);
check("opening a sheet closes the +N list", hudFrame.includes('new Event("hud-sheet")') && tagLayer.includes('addEventListener("hud-sheet"'));
const pillBase = { started: true, hearing: true, held: false, roomSoundOff: false, sheetOpen: false, blocked: false };
check(
  "the mute pill shows while playing or device-muted, and hides for a sheet, Room sound, a cold start, or blocked autoplay",
  mutePillVisible(pillBase) === true &&
    mutePillVisible({ ...pillBase, hearing: false, held: true }) === true &&
    mutePillVisible({ ...pillBase, hearing: false, held: false }) === false &&
    mutePillVisible({ ...pillBase, sheetOpen: true }) === false &&
    mutePillVisible({ ...pillBase, roomSoundOff: true }) === false &&
    mutePillVisible({ ...pillBase, started: false }) === false &&
    mutePillVisible({ ...pillBase, blocked: true, hearing: false }) === false,
);
check(
  "Unmute is only when this device muted a live station, otherwise the card reads Play",
  deviceMuted(false, false) === false &&
    deviceMuted(true, false) === true &&
    deviceMuted(false, true) === true &&
    radioControlLabel({ hearing: false, held: false, live: false, roomSoundOff: true, blocked: false }) === RADIO_CONTROLS.play &&
    radioControlLabel({ hearing: false, held: false, live: true, roomSoundOff: false, blocked: false }) === RADIO_CONTROLS.play &&
    radioControlLabel({ hearing: false, held: true, live: true, roomSoundOff: false, blocked: false }) === RADIO_CONTROLS.unmute &&
    radioControlLabel({ hearing: false, held: true, live: false, roomSoundOff: false, blocked: false }) === RADIO_CONTROLS.play &&
    radioControlLabel({ hearing: true, held: false, live: true, roomSoundOff: false, blocked: false }) === RADIO_CONTROLS.mute &&
    radioControlLabel({ hearing: true, held: false, live: true, roomSoundOff: false, blocked: true }) === RADIO_CONTROLS.play &&
    playingLineVisible(true, false) === true &&
    playingLineVisible(false, false) === false &&
    playingLineVisible(true, true) === false &&
    strings.PLAY === "Play" &&
    strings.MUTE === "Mute" &&
    strings.UNMUTE === "Unmute",
);
type SoundPage = {
  hearing: boolean;
  held: boolean;
  live: boolean;
  roomSoundOff: boolean;
  blocked: boolean;
  failed: boolean;
  sheetOpen: boolean;
  started: boolean;
  owner: boolean;
  radioOpen: boolean;
};
function blankSnapshot(live: boolean): LiveSnapshot {
  return {
    serverTime: 0,
    receivedAt: 0,
    room: { id: "room", name: "Room", description: "", bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 } },
    objects: [],
    agents: [],
    events: [],
    houseGuests: false,
    dog: { x: 0, z: 0, mode: "nap", mood: "quiet" },
    books: [],
    diary: [],
    drawings: [],
    radio: { on: live, name: "Night", url: "", stations: ["Night", "Day"], index: 0 },
    door: { locked: false, knocking: false },
  };
}
function soundPage(input: SoundPage) {
  const value: AmbienceValue = {
    muted: input.roomSoundOff,
    held: input.held,
    hearing: input.hearing,
    blocked: input.blocked,
    started: input.started,
    soundOff: input.roomSoundOff,
    failed: input.failed,
    toggleMute: () => {},
    pressMutePill: () => {},
    playFromCard: () => {},
    stopRadio: () => {},
  };
  const model: HudModel = {
    snapshot: blankSnapshot(input.live),
    status: "live",
    now: Date.parse("2026-10-06T16:00:00.000Z"),
    origin: "http://127.0.0.1",
    selectedId: null,
    selectAgent: () => {},
    openBooks: () => {},
    diaryOpen: false,
    setDiaryOpen: () => {},
  };
  return renderToStaticMarkup(
    createElement(
      AmbienceContext.Provider,
      { value },
      createElement(HudFrame, {
        role: input.owner ? "owner" : "watch",
        model,
        section: input.radioOpen ? "radio" : input.sheetOpen ? "activity" : null,
        open: () => {},
        close: () => {},
        children: null,
      }),
    ),
  );
}
function buttonTexts(html: string, ctl: string) {
  const out: string[] = [];
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (!match[1].includes(`data-ctl="${ctl}"`)) continue;
    out.push(match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  }
  return out;
}
function noUnmute(html: string) {
  return !html.includes('data-ctl="mute-pill"') && !buttonTexts(html, "radio-mute").includes(strings.UNMUTE) && !buttonTexts(html, "mute-pill").includes(strings.UNMUTE);
}
const soundBase: SoundPage = {
  hearing: false,
  held: false,
  live: true,
  roomSoundOff: false,
  blocked: false,
  failed: false,
  sheetOpen: false,
  started: true,
  owner: false,
  radioOpen: true,
};
const playHtml = soundPage({ ...soundBase, roomSoundOff: true, live: true, started: false, hearing: false });
check(
  "Play state renders a Play button",
    buttonTexts(playHtml, "radio-resume").join(" ") === `▶${strings.PLAY}` &&
    buttonTexts(playHtml, "radio-mute").length === 0 &&
    buttonTexts(playHtml, "mute-pill").length === 0 &&
    !playHtml.includes(strings.STATION_CANT_PLAY) &&
    playHtml.includes('role="status"') &&
    playHtml.includes('aria-live="polite"'),
);
const muteHtml = soundPage({ ...soundBase, hearing: true });
check(
  "Mute state renders a Mute button",
  buttonTexts(muteHtml, "radio-mute").join(" ") === strings.MUTE &&
    buttonTexts(muteHtml, "radio-resume").length === 0 &&
    buttonTexts(muteHtml, "mute-pill").length === 0 &&
    !buttonTexts(muteHtml, "radio-mute").includes(strings.PLAYING) &&
    muteHtml.includes("data-playing"),
);
const unmuteHtml = soundPage({ ...soundBase, held: true, hearing: false });
check(
  "Unmute state renders an Unmute button",
  buttonTexts(unmuteHtml, "radio-mute").join(" ") === strings.UNMUTE &&
    buttonTexts(unmuteHtml, "radio-resume").length === 0 &&
    buttonTexts(unmuteHtml, "mute-pill").length === 0 &&
    !unmuteHtml.includes(strings.PLAYING),
);
const watcherOff = soundPage({ ...soundBase, live: false, hearing: false, started: false, roomSoundOff: false });
check(
  "a watcher with the radio off sees no Play",
  watcherOff.includes(strings.RADIO_OFF) &&
    watcherOff.includes("hudf-quiet") &&
    !watcherOff.includes("hudf-station-fail\">" + strings.RADIO_OFF) &&
    buttonTexts(watcherOff, "radio-resume").length === 0 &&
    buttonTexts(watcherOff, "radio-play").length === 0 &&
    !watcherOff.includes(strings.STATION_CANT_PLAY),
);
check("Room sound Off leaves no pill and no Unmute button", noUnmute(soundPage({ ...soundBase, roomSoundOff: true, held: true, hearing: true })));
check("a blocked play leaves no pill and no Unmute button", noUnmute(soundPage({ ...soundBase, blocked: true, held: true, hearing: true })));
check("a failed play leaves no pill and no Unmute button", noUnmute(soundPage({ ...soundBase, failed: true, held: true, hearing: true })));
check("an open sheet leaves no pill and no Unmute button", noUnmute(soundPage({ ...soundBase, sheetOpen: true, held: true, hearing: true, radioOpen: false })));
check("room sound off blocks the mute pill", mutePillMayUnmute(false) === true && mutePillMayUnmute(true) === false);
check(
  "the mute pill reads Mute or Unmute and crosses the speaker for Unmute",
  mutePillLabel(false) === strings.MUTE && mutePillLabel(true) === strings.UNMUTE && mutePillIcon(false) === "vol" && mutePillIcon(true) === "mute",
);
check(
  "the mute pill is a local hold with no aria-pressed",
  hudFrame.includes('data-ctl="mute-pill"') &&
    hudFrame.includes("pressMutePill") &&
    !hudFrame.includes('data-ctl="mute-pill"\n          aria-pressed') &&
    ambienceSource.includes("mutePillMayUnmute(roomSoundOff())") &&
    ambienceSource.includes("writeHeld(true)") &&
    !ambienceSource.includes("unMute") &&
    hudCss.includes("width: 96px;") &&
    hudCss.includes("height: 44px;") &&
    hudCss.includes("right: 12px;") &&
    hudCss.includes("right: 16px;") &&
    hudCss.includes("animation: hudf-pill-in 150ms linear;") &&
    hudCss.includes("@keyframes hudf-pill-in") &&
    !hudCss.includes(".hudf button.hudf-mute-pill.is-in") &&
    hudFrame.includes("{pillShown ? (") &&
    hudFrame.includes('pillShown ? " has-mute-pill"') &&
    !hudFrame.includes("usePresence") &&
    hudCss.includes(".hudf.has-mute-pill .hudf-toast") &&
    !hudFrame.includes("aria-pressed={silent}") &&
    !hudFrame.includes("aria-pressed={muted || held}"),
);
const pinned = orderAgents([{ id: "ada" }, { id: "bea" }, { id: "cid" }], "cid");
const untouched = orderAgents([{ id: "ada" }, { id: "bea" }], null);
check(
  "a pinned agent is first and Activity expands that row",
  pinned.map((agent) => agent.id).join(",") === "cid,ada,bea" &&
    untouched.map((agent) => agent.id).join(",") === "ada,bea" &&
    orderAgents([{ id: "ada" }], "missing").length === 1 &&
    activitySource.includes("data-activity-pin") &&
    activitySource.includes("is-open") &&
    activitySource.includes("orderAgents") &&
    readFileSync(path.join(root, "app/hud.css"), "utf8").includes("rgba(43, 45, 49, 0.06)") &&
    hudFrame.includes('querySelector<HTMLElement>("[data-activity-pin]")') &&
    hudFrame.includes("pin.focus()"),
);

function radioSink() {
  let attr: string | null = null;
  const calls = { play: 0, load: 0, pause: 0, src: [] as string[] };
  let failName: string | null = null;
  let defer = false;
  let pendingReject: ((error: Error) => void) | null = null;
  const audio = {
    calls,
    get src() {
      return attr ?? "";
    },
    set src(value: string) {
      attr = value;
      calls.src.push(value);
    },
    getAttribute(name: string) {
      return name === "src" ? attr : null;
    },
    removeAttribute(name: string) {
      if (name === "src") attr = null;
    },
    load() {
      calls.load += 1;
    },
    pause() {
      calls.pause += 1;
    },
    play() {
      calls.play += 1;
      if (defer) {
        defer = false;
        return new Promise<void>((_resolve, reject) => {
          pendingReject = reject;
        });
      }
      if (failName) {
        const err = new Error("https://evil.example/secret MediaError boom");
        err.name = failName;
        const name = failName;
        failName = null;
        return {
          catch(fn: (error: Error) => void) {
            fn(Object.assign(err, { name }));
            return Promise.resolve();
          },
        } as unknown as Promise<void>;
      }
      return Promise.resolve();
    },
    failNext(name = "NotSupportedError") {
      failName = name;
    },
    deferNext() {
      defer = true;
    },
    rejectDeferred(name: string) {
      const err = new Error("https://evil.example/secret MediaError boom");
      err.name = name;
      const reject = pendingReject;
      pendingReject = null;
      reject?.(err);
    },
  };
  return audio;
}

function installStorage(value?: string | null) {
  const mem = new Map<string, string>();
  if (value != null) mem.set("living-room-mute", value);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (mem.has(key) ? mem.get(key)! : null),
      setItem: (key: string, next: string) => {
        mem.set(key, next);
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
    },
  });
  return mem;
}

{
  let off = true;
  let held = false;
  const audio = radioSink();
  const player = createRadioPlayback(audio as unknown as RadioSink, {
    roomSoundOff: () => off,
    deviceHeld: () => held,
    onChange() {},
  });
  player.follow(1);
  player.playAuto();
  player.tuneGesture(4);
  player.gesture();
  player.unmute();
  check(
    "Room sound Off refuses follow, playAuto, and station changes, including an injected URL",
    audio.calls.play === 0 && audio.calls.src.length === 0 && audio.getAttribute("src") === null && !JSON.stringify(player.state()).includes("evil.example"),
  );
  off = false;
  player.unmute();
  check("the src on unmute equals STATIONS[index].url", audio.getAttribute("src") === stationUrl(4) && audio.getAttribute("src") === STATIONS[STATIONS.length - 1]!.url);
  player.onPlaying();
  check("the playing event clears blocked and marks this device as started", player.state().hearing === true && player.state().blocked === false && player.state().failed === false && player.state().started === true);
  player.follow(0);
  check("a station change while playing uses the fixed list, not a room URL", audio.getAttribute("src") === STATIONS[0]!.url && audio.calls.src.every((url) => STATIONS.some((station) => station.url === url)));
  const playsAfterJoin = audio.calls.play;
  player.follow(0);
  check("a repeat of the current station does not call play again", audio.calls.play === playsAfterJoin);
  player.follow(1);
  check("a station change while playing reloads the fixed URL", audio.getAttribute("src") === STATIONS[1]!.url && audio.calls.src.includes(STATIONS[1]!.url));
  const playsWhileLive = audio.calls.play;
  const srcWhileLive = audio.calls.src.length;
  held = true;
  player.follow(0);
  check("muting drops src and a later station change still does not fetch", audio.getAttribute("src") === null && audio.calls.play === playsWhileLive && audio.calls.src.length === srcWhileLive);
  held = false;
  const stalled = audio.calls.play;
  player.follow(2);
  check("a remote station change does not start audio when nothing is playing", audio.calls.play === stalled && audio.getAttribute("src") === null);
}

{
  const audio = radioSink();
  let snap = { blocked: false, hearing: false, started: false, index: 0, failed: false };
  const player = createRadioPlayback(audio as unknown as RadioSink, {
    roomSoundOff: () => false,
    deviceHeld: () => false,
    onChange(state) {
      snap = state;
    },
  });
  player.onMediaError({ message: "https://evil.example/secret" });
  check("a media error with no src is ignored", snap.failed === false && audio.calls.play === 0 && audio.calls.src.length === 0);
  audio.failNext("NotAllowedError");
  player.gesture();
  check("a blocked tap stays Play with no fail line", audio.calls.play === 1 && snap.blocked === true && snap.failed === false && snap.hearing === false && snap.started === false);
  const srcAfterBlock = audio.getAttribute("src");
  const playsAfterBlock = audio.calls.play;
  player.follow(1);
  check("NotAllowedError does not retry or change src", audio.calls.play === playsAfterBlock && audio.getAttribute("src") === srcAfterBlock && snap.failed === false);
  audio.failNext("NotSupportedError");
  player.gesture();
  check("a failed tap sets the failed flag and does not use the browser message", snap.failed === true && snap.blocked === true && snap.started === false && !JSON.stringify(snap).includes("evil") && !JSON.stringify(snap).includes("NotSupportedError") && !JSON.stringify(snap).includes("https://"));
  const srcAfterFail = audio.getAttribute("src");
  const playsAfterFail = audio.calls.play;
  const srcWrites = audio.calls.src.length;
  player.follow(0);
  player.playAuto();
  player.tuneGesture(2);
  player.onMediaError({ message: "network down https://stream.example/a.mp3" });
  check(
    "an error does not retry or change src until the next Play tap",
    audio.calls.play === playsAfterFail && audio.calls.src.length === srcWrites && audio.getAttribute("src") === srcAfterFail,
  );
  player.onPlaying();
  check("playing clears the fail line and the blocked state", player.state().failed === false && player.state().blocked === false && player.state().started === true && player.state().hearing === true);
}

{
  installStorage(null);
  check("a missing Room sound key is Off", roomSoundStoredOff(null) === true && roomSoundStoredOff("1") === true && roomSoundStoredOff("0") === false && roomSoundOff() === true);
  const audio = radioSink();
  const player = connectRadio(audio);
  player.follow(1);
  player.playAuto();
  check(
    "a fresh profile does not set src or call play before a tap",
    audio.calls.play === 0 && audio.calls.src.length === 0 && audio.getAttribute("src") === null && roomSoundOff() === true,
  );
  playFromCard();
  check(
    "one Play tap turns Room sound On and plays STATIONS[index] once",
    roomSoundOff() === false && audio.calls.play === 1 && audio.getAttribute("src") === stationUrl(1) && audio.calls.src.every((url) => STATIONS.some((station) => station.url === url)),
  );
  player.onPlaying();
  setRoomSoundOff(true);
  check("turning Room sound Off pauses, drops src, and the card reads Play", audio.getAttribute("src") === null && audio.calls.pause > 0 && roomSoundOff() === true && radioControlLabel({ hearing: false, held: false, live: true, roomSoundOff: true, blocked: false }) === RADIO_CONTROLS.play);
  const plays = audio.calls.play;
  setRoomSoundOff(false);
  player.follow(0);
  check("turning Room sound On starts no audio and the card stays Play", audio.calls.play === plays && audio.getAttribute("src") === null && radioControlLabel({ hearing: false, held: false, live: true, roomSoundOff: false, blocked: false }) === RADIO_CONTROLS.play);
  playFromCard();
  player.onPlaying();
  pressMutePill();
  const mutedPlays = audio.calls.play;
  player.follow(2);
  check("mute persists across a station change", audio.calls.play === mutedPlays && audio.getAttribute("src") === null);
  playFromCard();
  check("Play while muted starts unmuted from the fixed list", roomSoundOff() === false && audio.calls.play === mutedPlays + 1 && audio.getAttribute("src") === stationUrl(2));
}

async function cancelBeforeStart(kind: "mute" | "off" | "station") {
  const audio = radioSink();
  let snap = { blocked: false, hearing: false, started: false, index: 0, failed: false };
  const player = createRadioPlayback(audio as unknown as RadioSink, {
    roomSoundOff: () => false,
    deviceHeld: () => false,
    onChange(state) {
      snap = state;
    },
  });
  const started = performance.now();
  audio.deferNext();
  player.gesture();
  if (kind === "mute") player.mute();
  else if (kind === "off") player.stop();
  else player.follow(2);
  audio.rejectDeferred("AbortError");
  await Promise.resolve();
  const elapsed = performance.now() - started;
  return elapsed < 100 && snap.failed === false && !JSON.stringify(snap).includes("AbortError") && !JSON.stringify(snap).includes("evil") && !JSON.stringify(snap).includes(strings.STATION_CANT_PLAY);
}
check("Play then Mute within 100ms shows no fail line", await cancelBeforeStart("mute"));
check("Play then Off within 100ms shows no fail line", await cancelBeforeStart("off"));
check("Play then a station change within 100ms shows no fail line", await cancelBeforeStart("station"));

{
  installStorage("0");
  const audio = radioSink();
  connectRadio(audio);
  playFromCard();
  const pauses = audio.calls.pause;
  const src = audio.getAttribute("src");
  noteRadioServer(false);
  check(
    "a snapshot with radio.on still false does not stop Play",
    src !== null && audio.getAttribute("src") === src && audio.calls.pause === pauses && audio.calls.play === 1,
  );
  noteRadioServer(true);
  noteRadioServer(false);
  check("a snapshot confirms Off only after the server showed the radio on", audio.getAttribute("src") === null && audio.calls.pause > pauses);
}

const hudCssFile = readFileSync(path.join(root, "app/hud.css"), "utf8");
check(
  "the pinned Activity focus ring is inset 4px",
  hudCssFile.includes(".hud-people > li.is-pin .hud-person-btn:focus-visible") && hudCssFile.includes("outline-offset: -4px"),
);
const warmAt = canvasSource.indexOf("function WarmTapPrograms");
const warmFn = warmAt >= 0 ? canvasSource.slice(warmAt, canvasSource.indexOf("function Picture", warmAt)) : "";
check(
  "selection-ring warm-up walks once, then once more when the first agent arrives",
  warmFn.includes("walks.current === 0") &&
    warmFn.includes("waitForAgent") &&
    warmFn.includes("if (count.current === 0) return") &&
    warmFn.includes("if (done.current) return") &&
    canvasSource.includes("<WarmTapPrograms agents=") &&
    warmFn.includes("gl.compile(mesh, camera, scene)") &&
    warmFn.includes("gl.compileAsync(mesh, camera, scene)") &&
    warmFn.split("scene.traverse(").length === 2 &&
    !warmFn.includes("traverseVisible") &&
    !canvasSource.includes("outputColorSpace: THREE.SRGBColorSpace"),
);
check(
  "Room sound Off, including a fresh device, keeps the mute pill hidden",
  hudFrame.includes("roomSoundOff: soundOff") &&
    ambienceSource.includes("useSyncExternalStore(subscribeMute, roomSoundOff, () => true)") &&
    !ambienceSource.includes("!== \"0\"") &&
    mutePillVisible({ ...pillBase, roomSoundOff: true }) === false &&
    mutePillVisible({ ...pillBase, started: false, hearing: false, roomSoundOff: true }) === false &&
    mutePillVisible({ ...pillBase, sheetOpen: true }) === false &&
    mutePillVisible({ ...pillBase, blocked: true, hearing: false }) === false,
);
check(
  "at 1440 the station line sits left of the pill and the center bar keeps no radio",
  hudCss.includes(".hudf.is-tucked .hudf-radio-cluster,") &&
    hudCss.includes("right: 16px;") &&
    hudCss.includes("bottom: 16px;") &&
    hudCss.includes("gap: 8px;") &&
    hudCss.includes("align-items: center;") &&
    hudCss.includes('.hudf .hudf-pill [data-ctl="pill-radio"]') &&
    hudCss.includes('.hudf .hudf-pill [data-ctl="pill-stop"]') &&
    hudFrame.includes('data-station-line=""') &&
    hudFrame.includes('data-radio-cluster=""') &&
    !hudFrame.includes('data-ctl="pill-mute"'),
);
const radioActions = readFileSync(path.join(root, "components/hud/frame/radio-actions.tsx"), "utf8");
check(
  "blocked autoplay shows a Play control and the Playing line is gated on hearing",
  hudFrame.includes("<RadioActionButtons") &&
    radioActions.includes('data-ctl="radio-resume"') &&
    radioActions.includes('aria-hidden="true">▶</span>') &&
    radioActions.includes("{PLAY}") &&
    radioActions.includes("RADIO_CONTROLS.play") &&
    !radioActions.includes("aria-label={PLAY}") &&
    !hudFrame.includes("aria-label={PLAY}") &&
    hudFrame.includes("data-playing=") &&
    hudFrame.includes("playingLineVisible(hearing, blocked)") &&
    hudCss.includes(".hudf button.hudf-play.is-resume") &&
    hudCss.includes("width: 96px;") &&
    hudCss.includes("min-width: 96px;") &&
    hudCss.includes("padding: 0 16px;") &&
    hudCss.includes("justify-content: center;") &&
    radioActions.includes("RADIO_CONTROLS.play && live") &&
    radioActions.includes("hudf-quiet") &&
    !radioActions.includes("PLAYING") &&
    !radioActions.includes("hudf-station-fail"),
);
const resumeAt = hudCss.indexOf(".hudf button.hudf-play.is-resume");
const resumeCss = resumeAt >= 0 ? hudCss.slice(resumeAt, resumeAt + 500) : "";
check(
  "Play, Mute, and Unmute share a 96px centered box",
  resumeCss.includes("width: 96px;") && resumeCss.includes("min-width: 96px;") && resumeCss.includes("padding: 0 16px;") && resumeCss.includes("justify-content: center;"),
);
check(
  "a stream failure shows the fixed line and a polite live region",
  strings.STATION_CANT_PLAY === "This station can't play right now." &&
    !("STREAM_FAIL" in strings) &&
    !text.includes("Can't play this station right now.") &&
    hudFrame.includes("{failed ? STATION_CANT_PLAY : \"\"}") &&
    hudFrame.includes('role="status"') &&
    hudFrame.includes('aria-live="polite"') &&
    hudFrame.includes('data-station-fail=""') &&
    !hudFrame.includes("STREAM_FAIL") &&
    !hudFrame.includes("error.message") &&
    !hudFrame.includes("MediaError") &&
    hudCss.includes(".hudf-station-fail") &&
    hudCss.includes("-webkit-line-clamp: 2") &&
    hudCss.includes("color: #2b2d31;") &&
    !hudCss.includes(".hudf-station-fail {\n  position:"),
);

check(
  "close-up is a real pressed button and the scene follows the house sky",
  hudFrame.includes('ctl="view-closeup"') &&
    hudFrame.includes("pressed={closeUp}") &&
    hudFrame.includes('"aria-pressed": pressed') &&
    hudFrame.includes("setCloseUp(!closeUp)") &&
    hudFrame.includes('raw !== ""') &&
    hudFrame.includes("Number.isFinite(Number(raw))") &&
    hudFrame.includes("fetch(`/api/sky${skyQuery}`)") &&
    hudFrame.includes('skyName === "rain"') &&
    hudFrame.includes("noteHouseSky(rain)") &&
    !readFileSync(path.join(root, "components/room/maquette/weather-scene.tsx"), "utf8").includes("api.weather.gov") &&
    !readFileSync(path.join(root, "components/room/maquette/weather-scene.tsx"), "utf8").includes("geolocation"),
);

function houseSpan(cam: THREE.PerspectiveCamera) {
  const pts = [
    new THREE.Vector3(-2.34, -0.36, -0.585),
    new THREE.Vector3(2.2, 8.28, 2.31),
    new THREE.Vector3(-2.34, 8.28, 2.31),
    new THREE.Vector3(2.2, -0.36, -0.585),
  ];
  let minX = 9;
  let maxX = -9;
  let minY = 9;
  let maxY = -9;
  for (const point of pts) {
    const projected = point.clone().project(cam);
    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

const skyRoute = readFileSync(path.join(root, "app/api/sky/route.ts"), "utf8");
const skySource = readFileSync(path.join(root, "lib/room/house-sky.ts"), "utf8");
const zoomSource = readFileSync(path.join(root, "components/room/frame-zoom.ts"), "utf8");
const weatherSource = readFileSync(path.join(root, "components/room/maquette/weather-scene.tsx"), "utf8");
const tagSource = readFileSync(path.join(root, "components/room/name-tag-layer.tsx"), "utf8");
check(
  "the sky route is private and does not publish a coordinate",
  skyRoute.includes('"Cache-Control": "private, no-store"') &&
    skyRoute.includes("previewSky(req)") &&
    skyRoute.includes("skyCellFromHeaders") &&
    !skyRoute.includes("latitude") &&
    !skyRoute.includes("longitude") &&
    !skySource.includes("console.") &&
    !skySource.includes("geolocation"),
);
const nyc = skyCellFromHeaders(new Headers());
const rounded = skyCellFromHeaders(new Headers({ "x-vercel-ip-latitude": "40.7128", "x-vercel-ip-longitude": "-74.006" }));
const invalid = skyCellFromHeaders(new Headers({ "x-vercel-ip-latitude": "nope", "x-vercel-ip-longitude": "-74" }));
const abroad = skyCellFromHeaders(new Headers({ "x-vercel-ip-latitude": "120", "x-vercel-ip-longitude": "10" }));
check(
  "viewer headers round to 0.1° and missing headers stay on the house cell",
  nyc.lat === 40.7 && nyc.lon === -74 && rounded.lat === 40.7 && rounded.lon === -74 && invalid.lat === HOUSE_CELL.lat && invalid.lon === HOUSE_CELL.lon && abroad.lat === HOUSE_CELL.lat && pointsUrl(rounded) === "https://api.weather.gov/points/40.7,-74.0",
  JSON.stringify({ nyc, rounded, invalid }),
);
const prevEnv = process.env.VERCEL_ENV;
const prevFetch = globalThis.fetch;
process.env.VERCEL_ENV = "production";
const ignored = previewSky(new Request("https://house.example/api/sky?sky=rain"));
process.env.VERCEL_ENV = "preview";
const forcedRain = previewSky(new Request("https://house.example/api/sky?sky=rain"));
const forcedClear = previewSky(new Request("https://house.example/api/sky?sky=clear"));
const forcedOther = previewSky(new Request("https://house.example/api/sky?sky=snow"));
delete process.env.VERCEL_ENV;
const localRain = previewSky(new Request("https://house.example/api/sky?sky=rain"));
check(
  "production ignores ?sky= and other environments can force rain or clear",
  ignored === null && forcedRain === "rain" && forcedClear === "clear" && forcedOther === null && localRain === "rain",
  JSON.stringify({ ignored, forcedRain, forcedClear, forcedOther, localRain }),
);
resetHouseSkyCache();
const called: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  called.push(url);
  if (url.includes("/points/")) {
    return new Response(JSON.stringify({ properties: { forecast: "https://api.weather.gov/gridpoints/OKX/33,37/forecast" } }), { status: 200 });
  }
  return new Response(JSON.stringify({ properties: { periods: [{ shortForecast: "Light Rain", temperature: 61, temperatureUnit: "F" }] } }), { status: 200 });
}) as typeof fetch;
const live = await houseSky({ lat: 40.7128, lon: -74.006 });
const again = await houseSky(roundCell(40.74, -73.96));
globalThis.fetch = (async () => new Response("no", { status: 404 })) as typeof fetch;
const foreign = await houseSky({ lat: 51.5, lon: -0.1 });
globalThis.fetch = prevFetch;
if (prevEnv === undefined) delete process.env.VERCEL_ENV;
else process.env.VERCEL_ENV = prevEnv;
const liveBody = JSON.stringify(skyBody(live));
check(
  "the forecast uses the rounded cell, stays out of the body, and a miss stays clear",
  called[0] === "https://api.weather.gov/points/40.7,-74.0" &&
    called.length === 2 &&
    again.rain === true &&
    again.source === "nws" &&
    live.rain === true &&
    foreign.rain === false &&
    foreign.source === "house" &&
    !/lat|lon|40\.7|-74/.test(liveBody),
  JSON.stringify({ called, liveBody, foreign }),
);
const closeAt = hudCss.indexOf(".hudf .hudf-rail button.hudf-closeup {");
const closeRule = closeAt >= 0 ? hudCss.slice(closeAt, closeAt + 900) : "";
check(
  "the close-up control is the first rail medal",
  closeRule.includes("min-width: 44px;") &&
    closeRule.includes("width: 44px;") &&
    closeRule.includes("height: 44px;") &&
    closeRule.includes('aria-pressed="true"') &&
    closeRule.includes("background: #2b2d31;") &&
    closeRule.includes("color: #f7f4ee;") &&
    !closeRule.includes("position: fixed;") &&
    !closeRule.includes("left: 68px;") &&
    hudFrame.includes('label="Close-up"') &&
    hudFrame.indexOf('id="closeup"') >= 0 &&
    hudFrame.indexOf('id="closeup"') < hudFrame.indexOf('id="today"'),
);
check(
  "a phone sheet card shrinks to its content",
  hudCss.includes("bottom: auto;") && hudCss.includes("height: auto;") && hudCss.includes("max-height: calc(100dvh - 132px - 176px);"),
);
check(
  "close-up and the tree no longer read debug offsets",
  !/cux|cuy|ptx|ptz/.test(zoomSource) && !/cux|cuy|ptx|ptz/.test(weatherSource) && !/cux|cuy|ptx|ptz/.test(hudFrame) && weatherSource.includes("[-4.9, -1.0]"),
);
const controlsSource = readFileSync(path.join(root, "components/hud/frame/controls.ts"), "utf8");
const rainFn = weatherSource.slice(weatherSource.indexOf("function Rain"), weatherSource.indexOf("const PHONE_TREE"));
const rainFrame = rainFn.slice(rainFn.indexOf("useFrame"), rainFn.indexOf("return ("));
check("name tags repaint when the lens or the view offset changes", tagSource.includes("lens.zoom") && tagSource.includes("offsetX") && tagSource.includes("offsetY") && tagSource.includes("viewMoved") && tagSource.includes('dataset.viewMove === "1"') && tagSource.includes("seenMoving"));
check(
  "close-up eases across frames and snaps back to the exact end pose",
  canvasSource.includes('dataset.viewMove = "1"') && canvasSource.includes("stepCount / 8") && canvasSource.includes("camera.zoom = z1"),
);
check(
  "rain scrolls in the shader and across the overlay without allocating each frame",
  rainFrame.includes("uT.value") && rainFrame.includes("invalidate()") && !rainFrame.includes("new ") && hudCss.includes("@keyframes hudf-rain") && hudCss.includes("animation: hudf-rain 1.1s linear infinite"),
);
check(
  "watchers do not get the diary or the shelf",
  activitySource.includes("watcher ? null") &&
    activitySource.includes('data-ctl="activity-diary"') &&
    activitySource.includes('data-ctl="activity-books"') &&
    controlsSource.includes('"activity-diary": { roles: owner') &&
    controlsSource.includes('"activity-books": { roles: owner'),
);
check(
  "an empty radio live region stays out of the card flow",
  hudCss.includes(".hudf-station-fail:empty") && hudCss.includes("clip: rect(0, 0, 0, 0);") && !hudCss.includes(".hudf-station-fail {\n  position:"),
);

const prevDocument = globalThis.document;
const prevWindow = globalThis.window;
const prevStyle = globalThis.getComputedStyle;
const frameEl = { dataset: { hudFrame: "1" } as Record<string, string> };
globalThis.document = {
  documentElement: frameEl,
  body: { appendChild() {} },
  createElement: () => ({ style: {} }),
  querySelector: () => null,
} as unknown as Document;
globalThis.window = {
  location: { search: "" },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
} as unknown as Window & typeof globalThis;
globalThis.getComputedStyle = (() => ({ paddingTop: "0", paddingRight: "0", paddingBottom: "0", paddingLeft: "0" })) as unknown as typeof getComputedStyle;
const zoomCases: Array<[number, number, string | null]> = [
  [390, 844, "38.9"],
  [1440, 900, "28.8"],
  [768, 1024, null],
  [844, 390, null],
];
let apartmentHolds = true;
const zoomDetail: string[] = [];
for (const [width, height, expected] of zoomCases) {
  setCloseUp(false);
  const wide = new THREE.PerspectiveCamera();
  const dist = fitCamera(wide, width, height, null);
  const span = houseSpan(wide);
  setCloseUp(true);
  const near = new THREE.PerspectiveCamera();
  const closeDist = fitCamera(near, width, height, null);
  const closeSpan = houseSpan(near);
  const floorCam = new THREE.PerspectiveCamera();
  fitCamera(floorCam, width, height, "kitchen");
  setCloseUp(false);
  const back = new THREE.PerspectiveCamera();
  const backDist = fitCamera(back, width, height, null);
  const label = dist.toFixed(1);
  const safe = hudSafeRect(width, height);
  const nearBox = projectedHull(near, width, height);
  const effective = (dist / closeDist) * near.zoom;
  const lensOk = near.zoom >= 1 && near.zoom <= 2 && Number.isFinite(near.zoom);
  const restored =
    back.zoom === wide.zoom &&
    backDist === dist &&
    Math.abs((back.view?.offsetX ?? 0) - (wide.view?.offsetX ?? 0)) < 1e-6 &&
    Math.abs((back.view?.offsetY ?? 0) - (wide.view?.offsetY ?? 0)) < 1e-6;
  let framed = true;
  if (width === 390 && height === 844) {
    framed = nearBox.l <= 2 && nearBox.r >= width - 2 && Math.abs(nearBox.t - (safe.y + 4)) < 3;
  } else if (width === 1440 && height === 900) {
    const cx = (nearBox.l + nearBox.r) / 2;
    const cy = (nearBox.t + nearBox.b) / 2;
    framed = Math.abs(cx - width / 2) < 8 && Math.abs(cy - (safe.y + safe.h / 2)) < 8;
  }
  const strong = expected == null || effective >= 1.4;
  const ok =
    wide.zoom >= 1 &&
    lensOk &&
    floorCam.zoom >= 1 &&
    closeSpan + 1e-6 >= span &&
    restored &&
    framed &&
    strong &&
    (expected == null || label === expected);
  if (!ok) apartmentHolds = false;
  zoomDetail.push(
    `${width}x${height} ${label} z${wide.zoom.toFixed(2)}->${near.zoom.toFixed(2)} eff${effective.toFixed(2)} box${nearBox.l.toFixed(0)},${nearBox.t.toFixed(0)},${nearBox.r.toFixed(0)},${nearBox.b.toFixed(0)}`,
  );
}
(globalThis.window as Window).location.search = "?closeup=Infinity&cux=40&cuy=80";
setCloseUp(true);
const infinite = new THREE.PerspectiveCamera();
fitCamera(infinite, 390, 844, null);
(globalThis.window as Window).location.search = "?closeup=9";
const huge = new THREE.PerspectiveCamera();
fitCamera(huge, 390, 844, null);
(globalThis.window as Window).location.search = "?closeup=1.02";
const asked = new THREE.PerspectiveCamera();
const askedDist = fitCamera(asked, 390, 844, null);
(globalThis.window as Window).location.search = "?closeup=1.02&cux=80&cuy=-40";
const askedShift = new THREE.PerspectiveCamera();
fitCamera(askedShift, 390, 844, null);
const safeZoom = (() => {
  setCloseUp(true);
  (globalThis.window as Window).location.search = "";
  const cam = new THREE.PerspectiveCamera();
  fitCamera(cam, 390, 844, null);
  return cam.zoom;
})();
check(
  "a close-up query is a finite lens in [1, 2] and debug offsets are ignored",
  closeUpZoomQuery() === null &&
    infinite.zoom === safeZoom &&
    huge.zoom === 2 &&
    asked.zoom <= 1.02 + 1e-6 &&
    asked.zoom >= 1 &&
    askedDist.toFixed(1) === "38.9" &&
    askedShift.zoom === asked.zoom &&
    Math.abs((askedShift.view?.offsetX ?? 0) - (asked.view?.offsetX ?? 0)) < 1e-6 &&
    Math.abs((askedShift.view?.offsetY ?? 0) - (asked.view?.offsetY ?? 0)) < 1e-6,
  `inf ${infinite.zoom.toFixed(3)} huge ${huge.zoom.toFixed(3)} asked ${asked.zoom.toFixed(3)} safe ${safeZoom.toFixed(3)}`,
);
setCloseUp(false);
globalThis.document = prevDocument;
globalThis.window = prevWindow;
globalThis.getComputedStyle = prevStyle;
check(
  "close-up is at least 1.4x and the default fit stays 38.9 / 28.8",
  apartmentHolds,
  zoomDetail.join(" | "),
);

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length}`);
if (failed) process.exit(1);
