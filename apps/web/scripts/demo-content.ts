/**
 * Hand-authored content for the demo graph. No randomness: pages and journal
 * entries are fixed, dates are expressed as `daysAgo` (resolved to `today - N`
 * at generation time). Backlinks reference pages by key, not by text.
 */

export type PageKey =
  | "korneliusz"
  | "manotes"
  | "manotesTasks"
  | "diary"
  | "migraineLog"
  | "sleepLog";

/** A run of inline content: plain text, or a backlink to a page. */
export type Inline = string | { backlink: PageKey };

export type Block = { h1: string } | { p: Array<Inline> };

export type Page = { title: string; blocks: Array<Block> };

/** An untitled journal note, dated `today - daysAgo`. */
export type Entry = { daysAgo: number; blocks: Array<Block> };

export const SOURCE_GRAPH_DISPLAY_NAME = "Manotes Demo";

/** Pages are titled docs (leading H1). Order here is creation order. */
export const PAGES: Record<PageKey, Page> = {
  korneliusz: {
    title: "Korneliusz Łapacz",
    blocks: [
      { h1: "Korneliusz Łapacz" },
      { p: ["Software engineer. I build ", { backlink: "manotes" }, ", a local-first notes app."] },
      {
        p: [
          "I keep a daily ",
          { backlink: "diary" },
          ", track my ",
          { backlink: "sleepLog" },
          ", and note every entry in the ",
          { backlink: "migraineLog" },
          ".",
        ],
      },
    ],
  },
  manotes: {
    title: "Manotes",
    blocks: [
      { h1: "Manotes" },
      {
        p: [
          "Manotes is an event-sourced, local-first notes app. Notes are materialized from an append-only event log, so a backup is just a replay of every event.",
        ],
      },
      { p: ["Open work lives in ", { backlink: "manotesTasks" }, "."] },
      { p: ["Built by ", { backlink: "korneliusz" }, "."] },
    ],
  },
  manotesTasks: {
    title: "Manotes tasks",
    blocks: [
      { h1: "Manotes tasks" },
      { p: ["Backup export and import — done."] },
      { p: ["Backlink autocomplete with ctrl-n / ctrl-p navigation — done."] },
      { p: ["Create a prepared demo graph — in progress."] },
      { p: ["Encrypted cloud sync — next up for ", { backlink: "manotes" }, "."] },
    ],
  },
  diary: {
    title: "Diary",
    blocks: [{ h1: "Diary" }, { p: ["A running personal journal. Daily entries link back here."] }],
  },
  migraineLog: {
    title: "Migraine Log",
    blocks: [
      { h1: "Migraine Log" },
      { p: ["Tracking migraine frequency, triggers, and severity (1–10)."] },
    ],
  },
  sleepLog: {
    title: "Sleep Log",
    blocks: [{ h1: "Sleep Log" }, { p: ["Nightly sleep duration and quality (1–10)."] }],
  },
};

const sleep = (daysAgo: number, text: string): Entry => ({
  daysAgo,
  blocks: [{ p: [{ backlink: "sleepLog" }, ` ${text}`] }],
});

const migraine = (daysAgo: number, text: string): Entry => ({
  daysAgo,
  blocks: [{ p: [{ backlink: "migraineLog" }, ` ${text}`] }],
});

/** Untitled journal notes. Ordering is irrelevant; each carries its own date. */
export const ENTRIES: Array<Entry> = [
  sleep(0, "7h10m, quality 8/10. Woke up before the alarm, felt rested."),
  sleep(1, "6h30m, quality 6/10. Went to bed late after a long coding session."),
  sleep(2, "8h00m, quality 9/10. Best night this week."),
  sleep(3, "5h45m, quality 4/10. Restless, kept waking up."),
  sleep(4, "7h20m, quality 7/10."),
  sleep(5, "7h50m, quality 8/10. Cool room, no screens before bed."),
  sleep(6, "6h00m, quality 5/10. Noise from the street."),
  sleep(7, "7h30m, quality 7/10."),
  sleep(8, "8h15m, quality 9/10. Weekend lie-in."),
  sleep(9, "5h30m, quality 3/10. Bad night, headache building."),
  sleep(10, "7h00m, quality 6/10."),
  sleep(11, "7h40m, quality 8/10."),
  sleep(12, "6h45m, quality 6/10."),
  sleep(13, "7h15m, quality 7/10."),
  sleep(14, "8h00m, quality 8/10."),
  sleep(15, "6h20m, quality 5/10. Too much coffee in the afternoon."),
  sleep(16, "7h05m, quality 7/10."),
  sleep(17, "7h35m, quality 8/10."),
  sleep(18, "6h50m, quality 6/10."),

  migraine(3, "Mild migraine, severity 4. Trigger: poor sleep the night before."),
  migraine(
    9,
    "Severe migraine, severity 8. Trigger: screen glare + skipped lunch. Took the afternoon off.",
  ),
  migraine(16, "Moderate migraine, severity 5. Trigger: dehydration."),
  migraine(24, "Mild migraine, severity 3. Cleared after coffee and a walk."),
  migraine(31, "Severe migraine, severity 7. Trigger: stormy weather front."),

  {
    daysAgo: 0,
    blocks: [
      {
        p: [
          "Shipped backup import end to end on ",
          { backlink: "manotes" },
          ". Round-trips cleanly in a fresh graph.",
        ],
      },
      { p: ["Wrote up the day in the ", { backlink: "diary" }, "."] },
    ],
  },
  {
    daysAgo: 1,
    blocks: [
      { p: [{ backlink: "diary" }, " Quiet day. Refactored the backlink menu and read a bit."] },
    ],
  },
  {
    daysAgo: 2,
    blocks: [
      {
        p: [
          "Paired on the ",
          { backlink: "manotesTasks" },
          " list and knocked out the autocomplete navigation.",
        ],
      },
    ],
  },
  {
    daysAgo: 4,
    blocks: [
      {
        p: [
          { backlink: "diary" },
          " Long walk by the river, then sketched out how the demo graph should look for ",
          { backlink: "manotes" },
          ".",
        ],
      },
    ],
  },
  {
    daysAgo: 6,
    blocks: [
      { p: [{ backlink: "diary" }, " Cooked dinner with friends. Good evening, no screens."] },
    ],
  },
  {
    daysAgo: 9,
    blocks: [
      {
        p: [
          { backlink: "diary" },
          " Rough day — see the ",
          { backlink: "migraineLog" },
          ". Logged off early and rested.",
        ],
      },
    ],
  },
  {
    daysAgo: 11,
    blocks: [
      { p: ["Planning session for ", { backlink: "manotes" }, ": next is encrypted cloud sync."] },
    ],
  },
  {
    daysAgo: 13,
    blocks: [{ p: [{ backlink: "diary" }, " Read about event sourcing. Took notes for later."] }],
  },
  {
    daysAgo: 14,
    blocks: [
      {
        p: [
          { backlink: "diary" },
          " Weekend. Slept in (see ",
          { backlink: "sleepLog" },
          ") and did nothing productive on purpose.",
        ],
      },
    ],
  },
  {
    daysAgo: 17,
    blocks: [
      { p: [{ backlink: "diary" }, " Started keeping the sleep and migraine logs seriously."] },
    ],
  },
  {
    daysAgo: 21,
    blocks: [
      {
        p: [
          { backlink: "diary" },
          " First commit on ",
          { backlink: "manotes" },
          ". Set up the event log and the materializer.",
        ],
      },
    ],
  },
];
