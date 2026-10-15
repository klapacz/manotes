import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import { Atom, AsyncResult, type AtomRegistry } from "effect/unstable/reactivity";
import { Option } from "effect";
import { useAtomResource, useAtomValue } from "@effect/atom-solid";
import { bindRt, createSyncedAtom } from "../../lib";
import type { RuntimeContext } from "../../lib/graph-access/graph-runtime/manager";
import { QueryEngine } from "../../lib/query-engine";
import { MenuSearch } from "../../lib/menu-search";

export type Options<T> = {
  query: QueryEngine.Query<T, unknown, RuntimeContext | AtomRegistry.AtomRegistry>;
  label: string;
  initialSearch?: string;
  defaultSearch?: string;
};

type Position = { search: string; highlighted: string; scrollTop: number };

export const Positions = createContext<Map<string, Position>>();

export function use<T extends { value: string }>(opts: Options<T>) {
  const positions = useContext(Positions);
  const positionKey = opts.label;
  const previous = opts.initialSearch === undefined ? positions?.get(positionKey) : undefined;

  const [search, setSearch] = createSignal(
    opts.initialSearch ?? previous?.search ?? opts.defaultSearch ?? "",
  );

  const [highlighted, setHighlighted] = createSignal(previous?.highlighted ?? "");
  let command: HTMLDivElement | undefined;
  const list = () => command?.querySelector<HTMLDivElement>("[data-command-scroll]");

  onMount(() => command?.querySelector("input")?.focus());

  onCleanup(() => {
    return positions?.set(positionKey, {
      search: search(),
      highlighted: highlighted(),
      scrollTop: list()?.scrollTop ?? 0,
    });
  });

  const requestAtom = createSyncedAtom(() => ({ text: search(), query: opts.query }));

  const queryAtom = bindRt((rt) => {
    return rt.atom((get) => {
      const request = get(requestAtom);

      return MenuSearch.run({
        request,
        query: request.query,
        debounce: Option.isSome(get.self()),
      });
    });
  });

  const state = useAtomValue(queryAtom);

  // Keep the loaded result stable so typing never re-suspends the command.
  const loaded = AsyncResult.success(true);

  const readinessAtom = createMemo(() => {
    return Atom.map(queryAtom(), (result) => {
      return AsyncResult.isInitial(result) ? AsyncResult.initial<boolean>() : loaded;
    });
  });

  const [ready] = useAtomResource(readinessAtom);

  const snapshot = createMemo(() => {
    const result = state();

    return AsyncResult.isSuccess(result) ? result.value : undefined;
  });

  const matches = createMemo(() => {
    const result = snapshot();

    return result?._tag === "Results" ? result.matches.map((match) => match.value) : [];
  });

  const fresh = createMemo(() => {
    const result = snapshot();

    if (result?._tag !== "Results" || result.text !== search()) return;

    return result;
  });

  let previousText: string | undefined;
  createEffect(
    on(fresh, (result) => {
      if (!result) return;
      const choices = result.matches.map((match) => match.value);
      const first = choices[0];

      if (!first) return;
      const text = result.text;
      const restoring = previousText === undefined && previous;
      const candidate = restoring ? previous.highlighted : highlighted();

      const keepSelection =
        (restoring || previousText === text) &&
        choices.some((choice) => choice.value === candidate);

      const selected = keepSelection ? candidate : first.value;
      previousText = text;

      requestAnimationFrame(() => {
        if (!command?.isConnected || search() !== text) return;
        setHighlighted(selected);
        const scroller = list();

        if (restoring && scroller) scroller.scrollTop = previous.scrollTop;
      });
    }),
  );

  // Limit mounted command items: rendering every note stalls large graphs.
  const visible = createMemo(() => matches().slice(0, 50));

  const status = createMemo(() => {
    return AsyncResult.isInitial(state())
      ? undefined
      : AsyncResult.isFailure(state())
        ? "Search unavailable"
        : snapshot()?._tag === "Slow"
          ? "Searching…"
          : "No results";
  });

  return {
    ready,
    search,
    highlighted,
    setHighlighted,
    matches,
    visible,
    status,
    attach: (element: HTMLDivElement) => (command = element),
    changeSearch: (text: string) => {
      const selected = highlighted();
      setSearch(text);

      // cmdk selects its first item on input; retain selection until new results arrive.
      queueMicrotask(() => {
        if (!command?.isConnected || search() !== text || fresh()) return;
        setHighlighted(selected);
      });
    },
  };
}

export * as PickerQuery from "./picker-query";
