import { Data, Effect, Option, Scope, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { MenuQuery } from "./menu-query";
import { QueryEngine } from "./query-engine";

describe("prefixed menu queries", () => {
  it("preserves action tags and payloads when nesting choices", async () => {
    const Choice = Data.taggedEnum<
      Data.TaggedEnum<{
        Link: { value: string; label: string; noteId: string };
        Date: { value: string; label: string; date: string };
      }>
    >();

    const query = MenuQuery.nested({
      label: "Choose",
      query: MenuQuery.choices(() => [
        Choice.Link({ value: "sleep", label: "Sleep Log", noteId: "sleep-note" }),
        Choice.Date({ value: "tomorrow", label: "Tomorrow", date: "2026-10-10" }),
      ]),
    });

    const results = await read(query({ text: "Choose " }));
    expect(results.map(({ value }) => value.value)).toEqual(["Choose:sleep", "Choose:tomorrow"]);
    expect(
      results.map(({ value }) =>
        Choice.$match(value, {
          Link: ({ noteId }) => noteId,
          Date: ({ date }) => date,
        }),
      ),
    ).toEqual(["sleep-note", "2026-10-10"]);
  });

  it("strips a leading label with a whitespace boundary, preserving unprefixed requests", async () => {
    const requests: QueryEngine.Request[] = [];

    const query = MenuQuery.nested({
      label: "Links to",
      query: (request) =>
        Stream.sync(() => {
          requests.push(request);

          return [{ value: { value: "note", label: request.text }, score: 1 }];
        }),
    });

    const results = await read(query({ text: "  LINKS TO   Sleep Log  " }));
    expect(requests[0]?.text).toBe("Sleep Log");
    expect(results[0]?.value).toEqual({
      value: "Links to:note",
      label: "Sleep Log",
      path: ["Links to"],
    });

    for (const text of ["Sleep Log", "links today", "about links to Sleep Log", "Links to"]) {
      const request = { text };
      await read(query(request));
      expect(requests.at(-1)).toBe(request);
    }

    await read(query({ text: "links to " }));
    expect(requests.at(-1)?.text).toBe("");
  });

  it("offers the parent action and direct child result together", async () => {
    const opened: (string | undefined)[] = [];
    let applied: string | undefined;

    const query = QueryEngine.combine([
      MenuQuery.actions(() => [
        {
          value: "links",
          label: "Links to",
          run: (text) => {
            opened.push(text);
          },
        },
      ]),
      MenuQuery.nested({
        label: "Links to",
        query: MenuQuery.choices(() => [
          {
            value: "sleep",
            label: "Sleep Log",
            run: () => {
              applied = "sleep";
            },
          },
        ]),
      }),
    ]);

    const results = await read(query({ text: "links to Sleep Log" }));
    expect(results.map((match) => match.value.value)).toEqual(["links", "Links to:sleep"]);
    results[0]?.value.run();
    expect(opened).toEqual(["Sleep Log"]);
    expect(applied).toBeUndefined();
    results[1]?.value.run();
    expect(applied).toBe("sleep");

    const normal = await read(query({ text: "Links to" }));
    normal[0]?.value.run();
    expect(opened).toEqual(["Sleep Log", undefined]);
  });

  it("binds the parent action to its own search and supports aliases", async () => {
    const opened: (string | undefined)[] = [];

    const query = MenuQuery.actions(() => [
      {
        value: "date",
        label: "Change date…",
        keywords: ["calendar"],
        run: (text) => {
          opened.push(text);
        },
      },
    ]);

    const previous = await read(query({ text: "Change date yesterday" }));
    const current = await read(query({ text: "CALENDAR tomorrow" }));
    previous[0]?.value.run();
    current[0]?.value.run();
    expect(opened).toEqual(["yesterday", "tomorrow"]);
  });

  it("shares an unprefixed lookup across sibling branches", async () => {
    let calls = 0;

    const notes = QueryEngine.share(() =>
      Stream.sync(() => {
        calls++;

        return [{ value: { value: "sleep", label: "Sleep Log" }, score: 1 }];
      }),
    );

    const query = QueryEngine.combine(
      ["Links to", "Links from", "Open note"].map((label) =>
        MenuQuery.nested({ label, query: notes }),
      ),
    );

    const results = await read(query({ text: "Sleep" }));
    expect(results).toHaveLength(3);
    expect(calls).toBe(1);
  });
});

function read<T, E>(stream: Stream.Stream<T, E, Scope.Scope>) {
  return Effect.runPromise(
    stream.pipe(Stream.scoped, Stream.runHead, Effect.map(Option.getOrThrow)),
  );
}
