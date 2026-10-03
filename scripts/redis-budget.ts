import http from "node:http";

/**
 * Local Upstash-shaped mock. Counts Redis commands for 50 concurrent looks
 * and one act. The door check must not add a second GET of living-room:state.
 */
async function main() {
  const store = new Map<string, string>();
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const args = JSON.parse(Buffer.concat(chunks).toString()) as unknown[];
    const cmd = String(args[0] ?? "").toUpperCase();
    const key = String(args[1] ?? "");
    let result: unknown = null;
    if (cmd === "GET") result = store.has(key) ? store.get(key) : null;
    else if (cmd === "SET") {
      store.set(key, String(args[2] ?? ""));
      result = "OK";
    } else if (cmd === "HGETALL") result = [];
    else if (cmd === "HSET") result = 1;
    else if (cmd === "DEL") result = 1;
    else if (cmd === "EVAL") {
      const script = String(args[1] ?? "");
      result = script.includes("INCR") ? [1, 60_000] : 1;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock redis did not bind");
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${address.port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "local-budget";

  const { actGuarded, allowFast, getEngine } = await import("../lib/room/access");
  const { redisCallCounts, resetRedisCalls } = await import("../lib/room/redis");
  const engine = getEngine();
  const registered = await engine.register({ name: "Rowan", emoji: "🌿", color: "#88aa66", ip: "budget" });
  if (!registered.ok || ("waiting" in registered && registered.waiting)) {
    console.log("FAIL register");
    process.exitCode = 1;
    server.close();
    return;
  }
  const token = registered.token;

  const stateGets = () => redisCallCounts()["GET living-room:state"] ?? 0;

  await new Promise((resolve) => setTimeout(resolve, 1100));
  resetRedisCalls();
  const held = await engine.doorHold(token);
  const limit = await allowFast(engine, `look:${token.slice(0, 12)}`, 90, 60_000);
  const single = await engine.look(token);
  const oneLook = {
    held: Boolean(held),
    limited: !limit.ok,
    status: single.ok ? 200 : single.status,
    stateGets: stateGets(),
    counts: redisCallCounts(),
  };

  await new Promise((resolve) => setTimeout(resolve, 1100));
  resetRedisCalls();
  const looks = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const waiting = await engine.doorHold(token);
      if (waiting) return waiting.status;
      const paced = await allowFast(engine, `look:${token.slice(0, 12)}`, 90, 60_000);
      if (!paced.ok) return 429;
      const result = await engine.look(token);
      return result.ok ? 200 : result.status;
    }),
  );
  const burst = {
    n: looks.length,
    status503: looks.filter((status) => status === 503).length,
    notOk: looks.filter((status) => status !== 200).length,
    stateGets: stateGets(),
    counts: redisCallCounts(),
  };

  resetRedisCalls();
  const acted = await actGuarded(engine, token, { action: "say", message: "hi" });
  const act = {
    type: acted.type,
    ok: acted.type === "act" ? acted.result.ok : false,
    stateGets: stateGets(),
    counts: redisCallCounts(),
  };

  console.log(JSON.stringify({ oneLook, burst, act }));
  if (oneLook.stateGets !== 1 || oneLook.status !== 200 || oneLook.held || oneLook.limited) process.exitCode = 1;
  if (burst.status503 !== 0 || burst.notOk !== 0 || burst.stateGets > 2) process.exitCode = 1;
  if (act.stateGets !== 1 || !act.ok) process.exitCode = 1;
  server.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "budget failed");
  process.exitCode = 1;
});
