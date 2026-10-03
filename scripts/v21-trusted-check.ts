// Local check: do the legacy room's trusted rows survive a v21 legacy claim (setOwnerIdentity without seeds:false)?
import { randomBytes } from "node:crypto";
import { RoomEngine } from "../lib/room/engine";
import { applySeedBooks } from "../lib/room/store/seed";
import { claimOwner, doorView } from "../lib/room/door";
const show = (e: any) => e.door.trusted.map((p: any) => `${p.name}(${p.id.endsWith("_seed") ? "seed" : p.id.slice(0, 8)}${p.ownerKey ? ",key" : ""})`).join(", ");
const a = new RoomEngine(); applySeedBooks(a); a.settle();
claimOwner(a as any, `own_${randomBytes(18).toString("hex")}`);
(a as any).expireKnocks?.();
console.log("seed state trusted:", show(a), "seeds:", (a as any).door.seeds);
const b = new RoomEngine(); b.hydrate(JSON.parse(JSON.stringify(a.serialize())));
console.log("after load:", show(b));
b.setOwnerIdentity("acct_test");
console.log("after claim:", show(b));
