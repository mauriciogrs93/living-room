import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

/** base64(gzip(json)). The blob is what room.state_gz stores. */
export function encodeState(json: string) {
  return gzipSync(Buffer.from(json, "utf8")).toString("base64");
}

export function decodeState(encoded: string) {
  return gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
}

/** sha256 hex. agent_tokens stores this, never the raw bearer token. */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
