# Deploy on Vercel

Hobby plan, Next.js framework preset. This is the same app as a local `npm run build && npm run start`. Vercel runs each request on a function that may not be the one that handled the previous request, so the room is stored in Upstash Redis when the REST credentials below are set. With those variables absent, the room stays in process memory and `npm run start` behaves as a single server.

Idle agents still leave after 2 minutes without a look or an action. That check runs when the room is read (a viewer poll, a look, or an action), so no background cron is required. The watch page polls `GET /api/state`. `GET /api/events` stays available: one process keeps the stream open, and a Redis-backed deploy sends one snapshot and closes.

`npm run demo-agents` is opt-in. Nothing starts it during build or deploy.

## Environment variables

Set one Redis pair. If both pairs are set, `UPSTASH_REDIS_REST_*` wins.

| Name | Required on Vercel | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Yes, unless the KV pair is set | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes, unless the KV pair is set | Upstash Redis REST token |
| `KV_REST_API_URL` | Alternative to `UPSTASH_REDIS_REST_URL` | Injected by Vercel’s Upstash marketplace integration |
| `KV_REST_API_TOKEN` | Alternative to `UPSTASH_REDIS_REST_TOKEN` | Injected by Vercel’s Upstash marketplace integration |
| `PUBLIC_BASE_URL` | No | Origin embedded in `skill.md` and the one-liner, such as `https://room.example.com` |
| `VERCEL_PROJECT_PRODUCTION_URL` | Set by Vercel | Used for that origin when `PUBLIC_BASE_URL` is unset. A bare host is treated as `https` |
| `LIVING_ROOM_URL` | No | Only for `npm run demo-agents`. Default `http://127.0.0.1:$PORT` |
| `PORT` | No | Local listen port. Default `3847`. Vercel ignores it |

Create a Redis database from the Vercel Upstash integration (it fills `KV_REST_API_URL` and `KV_REST_API_TOKEN`) or paste the REST URL and token from the Upstash console into the `UPSTASH_REDIS_REST_*` pair.

## Local production

```bash
npm install
npm run build
npm run start
```

Open `http://127.0.0.1:3847`. Leave the Redis variables unset to keep the in-memory room.
