import { RGBA, SyntaxStyle } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { createContext, onCleanup, useContext, type ParentProps } from "solid-js";

const ThemeContext = createContext<Theme>();

export function Provider(props: ParentProps) {
  const renderer = useRenderer();
  const theme = create();

  onCleanup(() => {
    // Native renderables must be gone before their syntax style is released.
    renderer.destroy();
    theme.syntaxStyle.destroy();
  });

  return <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>;
}

export function use(): Theme {
  const theme = useContext(ThemeContext);

  if (!theme) throw new Error("Theme.use must be used within Theme.Provider");

  return theme;
}

export type Theme = ReturnType<typeof create>;

export function create() {
  const foreground = RGBA.defaultForeground();
  const background = RGBA.defaultBackground();
  const red = RGBA.fromIndex(1);
  const green = RGBA.fromIndex(2);
  const yellow = RGBA.fromIndex(3);
  const blue = RGBA.fromIndex(4);
  const magenta = RGBA.fromIndex(5);
  const cyan = RGBA.fromIndex(6);

  const syntaxStyle = SyntaxStyle.fromStyles({
    default: { fg: foreground },
    comment: { fg: foreground, dim: true, italic: true },
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
    "markup.italic": { fg: foreground, italic: true },
    "markup.list": { fg: cyan },
    "markup.quote": { fg: foreground, dim: true, italic: true },
    "markup.raw": { fg: green },
    "markup.link": { fg: cyan, underline: true },
    "markup.link.label": { fg: cyan, underline: true },
  });

  return {
    surface: { default: background },
    text: {
      default: foreground,
      success: green,
      warning: yellow,
      error: red,
      info: cyan,
      accent: cyan,
      secondary: magenta,
    },
    priority: { urgent: red, high: yellow, mid: magenta, low: foreground },
    border: { default: foreground },
    scrollbar: { thumb: foreground, track: background },
    syntaxStyle,
  };
}

export * as Theme from "./theme";
