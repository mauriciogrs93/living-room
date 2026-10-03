/**
 * v21 test seed: a synthetic PRE-v21 (v20-style) room for the v21_test legacy-claim test. Writes the SQL to
 * argv[2] and the one pre-minted invite code to argv[3] (mode 600). The SQL carries no keys or codes: the
 * room's owner hash comes from a random key that is thrown away, and the invite is stored as its hash only.
 *   npx tsx scripts/v21-seed-legacy.ts /tmp/seed.sql /workspace/.secrets/legacy-invite.txt
 */
import { randomBytes } from "node:crypto";
import { writeFileSync, chmodSync } from "node:fs";
import { RoomEngine } from "../lib/room/engine";
import { applySeedBooks } from "../lib/room/store/seed";
import { claimOwner, inviteHash, newInviteCode } from "../lib/room/door";
import { encodeState } from "../lib/room/store/codec";
import type { RoomHost } from "../lib/room/engine-host";

const [sqlPath, codePath] = process.argv.slice(2);
if (!sqlPath || !codePath) throw new Error("usage: v21-seed-legacy.ts <sql-out> <code-out>");
const engine = new RoomEngine();
applySeedBooks(engine);
const room = engine as unknown as RoomHost;
engine.settle();
claimOwner(room, `own_${randomBytes(18).toString("hex")}`); // v20-style agent owner; the key is discarded
const marker = `Legacy marker ${randomBytes(3).toString("hex")}`;
room.house.books.push({ id: "legacy-marker", title: marker, pages: ["Written before v21. If you can read this after signing in, the room came with you."], updatedAt: Date.now() });
const code = newInviteCode();
const now = Date.now();
const exp = now + 3 * 3600_000; // long enough for the test run; single use
room.door.invites.push({ hash: inviteHash(code), at: now, exp, usedBy: "", usedAt: 0 });
const state = JSON.stringify(engine.serialize());
const gz = encodeState(state);
const sql = `with apt as (
  insert into v21_test.apartments (owner_id, kind, legacy) values (null, 'private', true) returning id
), r as (
  insert into v21_test.room (apartment_id, version, state_gz, public_door, updated_at)
  select id, 1, '${gz}', '{"locked":true,"knocking":false}'::jsonb, now() from apt returning apartment_id
)
insert into v21_test.invites (hash, apartment_id, created_at, expires_at)
select '${inviteHash(code)}', apartment_id, now(), to_timestamp(${exp} / 1000.0) from r
returning apartment_id;`;
writeFileSync(sqlPath, sql);
writeFileSync(codePath, JSON.stringify({ code, marker, exp }), { mode: 0o600 });
chmodSync(codePath, 0o600);
console.log(`seed sql written (${sql.length} bytes), marker "${marker}"`);
