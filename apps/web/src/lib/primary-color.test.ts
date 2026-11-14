import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createRoot } from "solid-js";
import { PrimaryColor } from "./primary-color";

beforeEach(() => vi.stubGlobal("window", new EventTarget()));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("persists valid selections per graph and restores existing plain strings", () => {
  const stored = new Map([["manotes:primary-color:graph-a", "iris"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  const graphA = PrimaryColor.create("graph-a");
  const graphB = PrimaryColor.create("graph-b");
  expect(graphA.color()).toBe("iris");
  expect(graphB.color()).toBe("green");

  for (const color of PrimaryColor.colors) {
    graphA.setColor(color);
    expect(graphA.color()).toBe(color);

    const restored = createRoot((dispose) => {
      const color = PrimaryColor.create("graph-a").color();
      dispose();

      return color;
    });

    expect(restored).toBe(color);
    expect(graphB.color()).toBe("green");
  }

  graphB.setColor("orange");
  expect(() => graphA.setColor("invalid")).toThrow();
  expect(graphA.color()).toBe("grass");
  expect(graphB.color()).toBe("orange");
  stored.set("manotes:primary-color:invalid-graph", "invalid");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(PrimaryColor.create("invalid-graph").color()).toBe("green");
});

it("applies every scale and removes all overrides on exit", () => {
  const setProperty = vi.fn();
  const removeProperty = vi.fn();
  vi.stubGlobal("document", { documentElement: { style: { setProperty, removeProperty } } });

  for (const color of PrimaryColor.colors) {
    setProperty.mockClear();
    PrimaryColor.apply(color);
    expect(setProperty).toHaveBeenCalledTimes(12);

    for (let step = 1; step <= 12; step++) {
      expect(setProperty).toHaveBeenCalledWith(
        `--primary-${step}`,
        `var(--color-${color}-${step})`,
      );
    }
  }

  PrimaryColor.clear();
  expect(removeProperty).toHaveBeenCalledTimes(12);

  for (let step = 1; step <= 12; step++) {
    expect(removeProperty).toHaveBeenCalledWith(`--primary-${step}`);
  }
});

it("surfaces browser storage read and write errors", () => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("Storage blocked");
    },
  });
  expect(() => PrimaryColor.create("graph-a")).toThrow("Storage blocked");

  vi.stubGlobal("localStorage", {
    getItem: () => "orange",
    setItem() {
      throw new Error("Storage full");
    },
  });
  const blockedWrite = PrimaryColor.create("graph-b");
  expect(blockedWrite.color()).toBe("orange");
  expect(() => blockedWrite.setColor("blue")).toThrow("Storage full");
});

it("syncs matching localStorage events and detaches when its owner is disposed", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem });
  const removeListener = vi.spyOn(window, "removeEventListener");

  const { graphA, graphB, dispose } = createRoot((dispose) => ({
    graphA: PrimaryColor.create("graph-a"),
    graphB: PrimaryColor.create("graph-b"),
    dispose,
  }));

  const notify = (key: string, color: string, storageArea: Storage | null = localStorage) => {
    const event = Object.assign(new Event("storage"), {
      key,
      newValue: color,
      storageArea,
      url: "https://manotes.localhost/another-view?panes=different",
    });

    window.dispatchEvent(event);
  };

  notify("manotes:primary-color:graph-a", "iris");
  expect(graphA.color()).toBe("iris");
  expect(graphB.color()).toBe("green");
  expect(setItem).not.toHaveBeenCalled();
  notify("manotes:primary-color:graph-a", "orange", null);
  expect(graphA.color()).toBe("iris");

  dispose();
  expect(removeListener).toHaveBeenCalledTimes(2);
  notify("manotes:primary-color:graph-a", "blue");
  expect(graphA.color()).toBe("iris");
});
