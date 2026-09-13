import { CliRenderEvents, RGBA, SyntaxStyle, type TerminalColors } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  type ParentProps,
} from "solid-js";

/*
 * Adapted from anomalyco/opencode, @opencode-ai/tui 1.18.30:
 * packages/tui/src/theme/index.ts (generateSystem, generateGrayScale,
 * generateMutedTextColor) and context/theme.tsx (idle syntax-style cleanup).
 * https://github.com/anomalyco/opencode/tree/dev/packages/tui/src
 * Copied to follow the terminal palette without a color library or contrast engine.
 * Changes: only task UI roles, calculate the needed gray steps, use OpenTUI's
 * ANSI fallback, and use black/white defaults until the terminal replies.
 * Theme selection, custom themes, diff colors, and mode locking are omitted.
 *
 * MIT License
 * Copyright (c) 2025 opencode
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const ThemeContext = createContext<Theme>();

export function Provider(props: ParentProps) {
  const renderer = useRenderer();
  const [current, setCurrent] = createSignal(create(undefined, renderer.themeMode ?? "dark"));
  const styles = new Set([current().syntaxStyle]);
  let disposed = false;
  let received = false;

  const update = (colors: TerminalColors) => {
    if (disposed) return;
    received = true;
    const previous = current();
    const next = create(colors, renderer.themeMode ?? "dark");
    styles.add(next.syntaxStyle);
    setCurrent(next);
    // Markdown updates child styles during rendering, not in its prop setter.
    void renderer
      .idle()
      .catch(() => {})
      .finally(() => {
        if (styles.delete(previous.syntaxStyle)) previous.syntaxStyle.destroy();
      });
  };

  const refresh = () => {
    renderer.clearPaletteCache();
    void renderer.getPalette({ size: 16 }).catch(() => {});
  };

  renderer.on(CliRenderEvents.PALETTE, update);
  renderer.on(CliRenderEvents.FOCUS, refresh);
  void renderer
    .getPalette({ size: 16 })
    .then((colors) => {
      // getPalette can return a cached palette without emitting an event.
      if (!received) update(colors);
    })
    .catch(() => {});

  createEffect(() => renderer.setBackgroundColor(current().surface.default));

  onCleanup(() => {
    disposed = true;
    renderer.off(CliRenderEvents.PALETTE, update);
    renderer.off(CliRenderEvents.FOCUS, refresh);
    renderer.destroy();

    for (const style of styles) style.destroy();
    styles.clear();
  });

  const theme = new Proxy(current(), {
    get(_target, key: keyof Theme) {
      return current()[key];
    },
  });

  return <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>;
}

export function use(): Theme {
  const theme = useContext(ThemeContext);

  if (!theme) throw new Error("Theme.use must be used within Theme.Provider");

  return theme;
}

export type Theme = ReturnType<typeof create>;

export function create(colors?: TerminalColors, mode: "dark" | "light" = "dark") {
  const background = RGBA.fromHex(
    colors?.defaultBackground ?? colors?.palette[0] ?? (mode === "dark" ? "#000000" : "#ffffff"),
  );

  const foreground = RGBA.fromHex(
    colors?.defaultForeground ?? colors?.palette[7] ?? (mode === "dark" ? "#ffffff" : "#000000"),
  );

  const luminance = (0.299 * background.r + 0.587 * background.g + 0.114 * background.b) * 255;
  const dark = colors?.defaultBackground ? luminance <= 127.5 : mode === "dark";

  const color = (index: number) => {
    const value = colors?.palette[index];

    return value ? RGBA.fromHex(value) : RGBA.fromIndex(index);
  };

  const red = color(1);
  const green = color(2);
  const yellow = color(3);
  const blue = color(4);
  const magenta = color(5);
  const cyan = color(6);
  const panel = gray(background, luminance, dark, 2);
  const element = gray(background, luminance, dark, 3);
  const border = gray(background, luminance, dark, 7);
  const muted = mutedText(luminance, dark);

  const syntaxStyle = SyntaxStyle.fromStyles({
    default: { fg: foreground },
    comment: { fg: muted, italic: true },
    string: { fg: green },
    number: { fg: yellow },
    boolean: { fg: yellow },
    keyword: { fg: magenta },
    type: { fg: cyan },
    function: { fg: blue },
    operator: { fg: cyan },
    variable: { fg: foreground },
    punctuation: { fg: foreground },
    "punctuation.special": { fg: cyan },
    "markup.heading.1": { fg: foreground, bold: true },
    "markup.heading.2": { fg: foreground, bold: true },
    "markup.heading.3": { fg: foreground, bold: true },
    "markup.bold": { fg: foreground, bold: true },
    "markup.strong": { fg: foreground, bold: true },
    "markup.italic": { fg: yellow, italic: true },
    "markup.list": { fg: blue },
    "markup.quote": { fg: yellow, italic: true },
    "markup.raw": { fg: green },
    "markup.link": { fg: blue, underline: true },
    "markup.link.label": { fg: cyan, underline: true },
  });

  return {
    surface: {
      default: RGBA.fromValues(background.r, background.g, background.b, 0),
      backdrop: background,
      panel,
      element,
    },
    text: {
      default: foreground,
      muted,
      success: green,
      warning: yellow,
      error: red,
      info: cyan,
      accent: cyan,
      secondary: magenta,
    },
    selection: { foreground: background, background: cyan },
    priority: { urgent: red, high: yellow, mid: magenta, low: muted },
    border: { default: border },
    scrollbar: { thumb: border, track: element },
    syntaxStyle,
  };
}

function gray(background: RGBA, luminance: number, dark: boolean, step: number) {
  const factor = step / 12;

  if (dark && luminance < 10) {
    const value = Math.floor(factor * 0.4 * 255);

    return RGBA.fromInts(value, value, value);
  }

  if (!dark && luminance > 245) {
    const value = Math.floor(255 - factor * 0.4 * 255);

    return RGBA.fromInts(value, value, value);
  }

  const next = dark ? luminance + (255 - luminance) * factor * 0.4 : luminance * (1 - factor * 0.4);
  const ratio = next / luminance;

  return RGBA.fromInts(
    Math.floor(Math.min(background.r * 255 * ratio, 255)),
    Math.floor(Math.min(background.g * 255 * ratio, 255)),
    Math.floor(Math.min(background.b * 255 * ratio, 255)),
  );
}

function mutedText(luminance: number, dark: boolean) {
  const value = dark
    ? luminance < 10
      ? 180
      : Math.min(Math.floor(160 + luminance * 0.3), 200)
    : luminance > 245
      ? 75
      : Math.max(Math.floor(100 - (255 - luminance) * 0.2), 60);

  return RGBA.fromInts(value, value, value);
}

export * as Theme from "./theme";
