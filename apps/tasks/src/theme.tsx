import { useAtomValue } from "@effect/atom-solid";
import {
  buildTerminalPaletteSignature,
  CliRenderEvents,
  RGBA,
  SyntaxStyle,
  type CliRenderer,
  type TerminalColors,
} from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { colord, extend } from "colord";
import mixPlugin from "colord/plugins/mix";
import { Effect, Queue, Stream } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { createContext, Show, useContext, type Accessor, type ParentProps } from "solid-js";

/*
 * Adapted from anomalyco/opencode, @opencode-ai/tui 1.18.30:
 * packages/tui/src/theme/index.ts (system color assignments).
 * https://github.com/anomalyco/opencode/tree/dev/packages/tui/src
 * Copied to keep OpenCode's system color roles.
 * Changes: task UI roles only, colord RGB mixing instead of custom gray/muted
 * formulas, OpenTUI ANSI fallback, and Effect-owned theme resources.
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
extend([mixPlugin]);

const ThemeContext = createContext<Accessor<Theme>>();

export function Provider(props: ParentProps) {
  const atom = create(useRenderer());

  const theme = useAtomValue(
    () => atom,
    (result) => AsyncResult.getOrElse(result, () => undefined),
  );

  return (
    <Show when={theme()}>
      {(current) => <ThemeContext.Provider value={current}>{props.children}</ThemeContext.Provider>}
    </Show>
  );
}

export function use(): Theme {
  const theme = useContext(ThemeContext);

  if (!theme) throw new Error("Theme.use must be used within Theme.Provider");

  return new Proxy(theme(), {
    get(_target, key: keyof Theme) {
      return theme()[key];
    },
  });
}

export type Theme = ReturnType<typeof fromPalette>;

export function create(renderer: CliRenderer) {
  return Atom.make(
    paletteUpdates(renderer).pipe(
      Stream.mapEffect((colors) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const theme = fromPalette(colors);
            renderer.setBackgroundColor(theme.surface.default);

            return theme;
          }),
          // Keep native styles alive while Markdown can still reference them.
          (theme) =>
            Effect.promise(() => renderer.idle()).pipe(
              Effect.andThen(Effect.sync(() => theme.syntaxStyle.destroy())),
            ),
        ),
      ),
      Stream.scoped,
    ),
  );
}

function fromPalette(colors: TerminalColors) {
  const base = colord(colors.defaultBackground ?? colors.palette[0] ?? "#000000");
  const foreground = RGBA.fromHex(colors.defaultForeground ?? colors.palette[7] ?? "#ffffff");
  const background = RGBA.fromHex(base.toHex());
  const neutral = base.isDark() ? "#ffffff" : "#000000";

  const color = (index: number) => {
    const value = colors.palette[index];

    return value ? RGBA.fromHex(value) : RGBA.fromIndex(index);
  };

  const red = color(1);
  const green = color(2);
  const yellow = color(3);
  const blue = color(4);
  const magenta = color(5);
  const cyan = color(6);
  // OpenCode's role spacing, using library interpolation instead of its RGB scaling.
  const panel = RGBA.fromHex(base.mix(neutral, 2 / 30, "rgb").toHex());
  const element = RGBA.fromHex(base.mix(neutral, 3 / 30, "rgb").toHex());
  const border = RGBA.fromHex(base.mix(neutral, 7 / 30, "rgb").toHex());
  const muted = RGBA.fromHex(base.grayscale().mix(neutral, 0.7, "rgb").toHex());

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
      default: RGBA.fromHex(base.alpha(0).toHex()),
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

function paletteUpdates(renderer: CliRenderer) {
  return Stream.callback<TerminalColors>((queue) =>
    Effect.gen(function* () {
      const update = (colors: TerminalColors) => {
        Queue.offerUnsafe(queue, colors);
      };

      const refresh = () => {
        renderer.clearPaletteCache();
        void renderer
          .getPalette({ size: 16 })
          .then(update)
          .catch(() => {});
      };

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          renderer.on(CliRenderEvents.PALETTE, update);
          renderer.on(CliRenderEvents.FOCUS, refresh);
        }),
        () =>
          Effect.sync(() => {
            renderer.off(CliRenderEvents.PALETTE, update);
            renderer.off(CliRenderEvents.FOCUS, refresh);
          }),
      );

      // A cached palette may not emit PALETTE.
      yield* Effect.tryPromise(() => renderer.getPalette({ size: 16 })).pipe(
        Effect.tap((colors) => Effect.sync(() => update(colors))),
        Effect.catch(() => Effect.void),
      );
    }),
  ).pipe(
    Stream.changesWith(
      (previous, next) =>
        buildTerminalPaletteSignature(previous) === buildTerminalPaletteSignature(next),
    ),
  );
}

export * as Theme from "./theme";
