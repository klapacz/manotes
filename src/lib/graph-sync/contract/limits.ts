// Durable Object SQLite accepts at most 100 bound values per statement.
// A graph-sync commit inserts 4 bound columns per event, so 25 is the largest
// batch size that fits in one `INSERT ... RETURNING`.
export const MAX_EVENTS_PER_COMMIT = 25;

// Cap each Replay WebSocket frame to avoid hitting Cloudflare's message size
// limits. At ~1KB per event this keeps frames around ~100KB.
export const MAX_EVENTS_PER_REPLAY = 100;
