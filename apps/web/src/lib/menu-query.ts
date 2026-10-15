import { Stream } from "effect";
import type { Picker } from "../components/ui/picker";
import { QueryEngine } from "./query-engine";

export type Action = Picker.Choice & { run: (childText?: string) => void };

export function choices<T extends Picker.Choice>(values: () => readonly T[]): QueryEngine.Query<T> {
  return (request) => {
    return Stream.sync(() => {
      return values().flatMap((value) => {
        const score = QueryEngine.score({
          text: request.text,
          label: value.label,
          keywords: value.keywords,
        });

        return score > 0 ? [{ value, score }] : [];
      });
    });
  };
}

export function actions(values: () => readonly Action[]): QueryEngine.Query<Action> {
  return (request) => {
    return Stream.sync(() => {
      return values().flatMap((action) => {
        const childText = [action.label, ...(action.keywords ?? [])]
          .map((label) => prefixText({ label, text: request.text }))
          .find((text) => text !== undefined);

        const score =
          childText === undefined
            ? QueryEngine.score({
                text: request.text,
                label: action.label,
                keywords: action.keywords,
              })
            : 1;

        if (!score) return [];

        return [
          {
            value:
              childText === undefined ? action : { ...action, run: () => action.run(childText) },
            score,
          },
        ];
      });
    });
  };
}

export function nested<T extends Picker.Choice, E, R>(opts: {
  label: string;
  query: QueryEngine.Query<T, E, R>;
}): QueryEngine.Query<T & { path: readonly string[] }, E, R> {
  const query = QueryEngine.map(opts.query, (choice) => ({
    ...choice,
    value: `${opts.label}:${choice.value}`,
    path: [opts.label, ...(choice.path ?? [])],
  }));

  return (request) => {
    if (request.text.trim().length < 2) return Stream.succeed([]);
    const text = prefixText({ label: opts.label, text: request.text });

    return query(text === undefined ? request : { text });
  };
}

export * as MenuQuery from "./menu-query";

function prefixText(opts: { label: string; text: string }): string | undefined {
  const text = opts.text.trimStart();
  const label = opts.label.replace(/…$/, "");

  if (!text.toLowerCase().startsWith(label.toLowerCase())) return;
  const rest = text.slice(label.length);

  if (!/^\s/.test(rest)) return;

  return rest.trim();
}
