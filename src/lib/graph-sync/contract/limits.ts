// Durable Object SQLite accepts at most 100 bound values per statement.
// A graph-sync commit inserts 4 bound columns per event, so 25 is the largest
// batch size that fits in one `INSERT ... RETURNING`.
export const MAX_EVENTS_PER_COMMIT = 25;
