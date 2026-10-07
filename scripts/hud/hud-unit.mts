// HUD unit checks. No network, no email.
//   npx tsx scripts/hud/hud-unit.mts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { houseClockLabel, sunriseTime, sunsetTime } from "../../lib/house-clock";
import { doorLeafAnchor } from "../../components/room/maquette/door-mesh";
import { anchorLift, windowAnchor } from "../../lib/room/anchor-heights";
import { HUD_CONTROLS, houseControls, yoursCards, yoursControls } from "../../components/hud/frame/controls";
import { cleanHud, httpLink, httpsUrl } from "../../components/hud/frame/sanitize";
import * as strings from "../../components/hud/frame/strings";

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
for (const banned of ["Open-Meteo", "17TRACK", "Spotify", "YouTube", "youtube", "ytimg", "TODO-WRITER"]) {
  check(`HUD strings have no ${banned}`, !text.includes(banned));
}

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
for (const dir of ["app", "components", "lib"]) walk(path.join(root, dir), files);
const bannedSource = ["Open-Meteo", "17TRACK", "ytimg", "youtube-nocookie", "fonts.googleapis", "TODO-WRITER", "navigator.geolocation"];
for (const file of files) {
  const body = readFileSync(file, "utf8");
  for (const word of bannedSource) {
    if (body.includes(word)) check(`shipped source has no ${word}`, false, path.relative(root, file));
  }
}
check("shipped source scan finished", files.length > 20, `${files.length} files`);

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length}`);
if (failed) process.exit(1);
