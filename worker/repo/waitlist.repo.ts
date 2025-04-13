import { eq } from "drizzle-orm";
import { db } from "../db";
import { waitlist } from "../db/schema/waitlist";

export function get(email: string) {
  return db.select().from(waitlist).where(eq(waitlist.email, email)).get();
}

export function create(email: string) {
  return db.insert(waitlist).values({ email }).get();
}
