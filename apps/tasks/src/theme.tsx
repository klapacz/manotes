import { CliRenderEvents, SyntaxStyle, type TerminalColors } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { createContext, createSignal, onCleanup, useContext, type ParentProps } from "solid-js";
import { fromPalette, type Palette } from "./theme-colors";

const ThemeContext = createContext<Theme>();

export function Provider(props: ParentProps) {
  const renderer = useRenderer();
  const [current, setCurrent] = createSignal(create());
  // Markdown propagates styles to child renderables during a later frame.
  // Cache each palette for this renderer's lifetime rather than freeing a
  // handle that a hidden/deferred Markdown block may still reference.
  const themes = new Map<string, Theme>([["native", current()]]);
  let disposed = false;
  let generation = 0;

  const update = (palette: TerminalColors) => {
    if (disposed) return;
    generation++;

    const key = JSON.stringify([
      palette.defaultForeground,
      palette.defaultBackground,
      palette.palette.slice(0, 16),
    ]);

    let theme = themes.get(key);

    if (!theme) {
      theme = create(palette);
      themes.set(key, theme);
    }

    setCurrent(theme);
  };

  const query = () => {
    const started = generation;
    void renderer
      .getPalette({ size: 16, timeout: 200 })
      .then((palette) => {
        // A PALETTE event may already have published this query, or a newer one.
        if (!disposed && generation === started) update(palette);
      })
      .catch(() => {
        // Keep native colors at startup, or the last known palette on failure.
      });
  };

  const refresh = () => {
    renderer.clearPaletteCache();
    query();
  };

  renderer.on(CliRenderEvents.PALETTE, update);
  renderer.on(CliRenderEvents.FOCUS, refresh);
  query();

  onCleanup(() => {
    disposed = true;
    renderer.off(CliRenderEvents.PALETTE, update);
    renderer.off(CliRenderEvents.FOCUS, refresh);
    // Native renderables must be gone before their syntax styles are released.
    renderer.destroy();

    for (const theme of themes.values()) theme.syntaxStyle.destroy();
    themes.clear();
  });

  // Keep Theme.use() stable while each property tracks palette changes. This
  // avoids remounting the app and losing selection or preview scroll position.
  const theme: Theme = {
    get surface() {
      return current().surface;
    },
    get text() {
      return current().text;
    },
    get selection() {
      return current().selection;
    },
    get tab() {
      return current().tab;
    },
    get priority() {
      return current().priority;
    },
    get border() {
      return current().border;
    },
    get scrollbar() {
      return current().scrollbar;
    },
    get syntaxStyle() {
      return current().syntaxStyle;
    },
  };

  return <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>;
}

export function use(): Theme {
  const theme = useContext(ThemeContext);

  if (!theme) throw new Error("Theme.use must be used within Theme.Provider");

  return theme;
}

export type Theme = ReturnType<typeof create>;

export function create(palette?: Palette) {
  const roles = fromPalette(palette);
  const { text } = roles;

  const syntaxStyle = SyntaxStyle.fromStyles({
    default: { fg: text.default },
    comment: { fg: text.muted, italic: true },
    string: { fg: text.success },
    number: { fg: text.secondary },
    boolean: { fg: text.secondary },
    keyword: { fg: text.secondary, italic: true },
    type: { fg: text.warning },
    function: { fg: text.accent },
    operator: { fg: text.info },
    variable: { fg: text.default },
    punctuation: { fg: text.muted },
    "punctuation.special": { fg: text.info },
    "markup.heading.1": { fg: text.accent, bold: true },
    "markup.heading.2": { fg: text.warning, bold: true },
    "markup.heading.3": { fg: text.warning },
    "markup.bold": { fg: text.warning, bold: true },
    "markup.strong": { fg: text.warning, bold: true },
    "markup.italic": { fg: text.secondary, italic: true },
    "markup.list": { fg: text.default, bold: true },
    "markup.quote": { fg: text.muted, italic: true },
    "markup.raw": { fg: text.success },
    "markup.link": { fg: text.info, underline: true },
    "markup.link.label": { fg: text.info, underline: true },
  });

  return { ...roles, syntaxStyle };
}

export * as Theme from "./theme";
