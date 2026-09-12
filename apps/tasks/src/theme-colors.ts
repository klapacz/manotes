import { RGBA, TextAttributes, type TerminalColors } from "@opentui/core";

/*
 * Adapted from GooseRooster/osc-colors.nvim at
 * de4be29f3d5f22de6bc26756108e104f5fa2a411:
 * lua/osc-colors/osc.lua (neutral ramp), colors.lua (UI assignments),
 * roles.lua (contrast correction), and oklch.lua (OKLab and gamut mapping).
 * https://github.com/GooseRooster/osc-colors.nvim/tree/de4be29f3d5f22de6bc26756108e104f5fa2a411
 * Copied to derive readable terminal colors without a Lua runtime or dependency.
 * Changes: RGBA inputs, app-specific roles, no dominant-hue rotations, preserve
 * ANSI anchor hues, and search both lightness directions against every backdrop.
 * Missing OSC values never participate in RGB calculations.
 *
 * MIT License
 * Copyright (c) 2026 GooseRooster
 * Copyright (c) 2025 Tinted Theming <https://github.com/tinted-theming>
 * Copyright (c) 2022 Adam Regasz-Rethy
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

export type Palette = Pick<TerminalColors, "palette" | "defaultForeground" | "defaultBackground">;

export function fromPalette(palette?: Palette) {
  const foreground = parse(palette?.defaultForeground);
  const background = parse(palette?.defaultBackground);

  if (!foreground || !background) return nativeColors();

  const elevated = mix(background, foreground, 1 / 7);
  const selected = mix(background, foreground, 2 / 7);
  const backdrops = [background, elevated, selected];
  const text = (color: RGBA) => readable(color, backdrops);
  // A partial palette can still supply neutral shades, but not guessed accents.
  const accent = (index: number) => text(parse(palette?.palette[index]) ?? foreground);
  const muted = text(mix(background, foreground, 4 / 7));
  const primary = text(foreground);
  const red = accent(1);
  const green = accent(2);
  const yellow = accent(3);
  const blue = accent(4);
  const magenta = accent(5);
  const cyan = accent(6);
  const tabBackground = parse(palette?.palette[4]) ?? selected;
  const border = readable(mix(background, foreground, 3 / 7), backdrops, 3);
  // Keep the terminal's default background intent, including its transparency.
  // These snapshots are queried RGB values, unlike RGBA's built-in fallbacks.
  const defaultBackground = RGBA.defaultBackground(background);

  return {
    surface: { default: defaultBackground, elevated },
    text: {
      default: primary.equals(foreground) ? RGBA.defaultForeground(foreground) : primary,
      muted,
      success: green,
      warning: yellow,
      error: red,
      info: cyan,
      accent: blue,
      secondary: magenta,
    },
    selection: { background: selected, attributes: TextAttributes.NONE },
    tab: {
      active: {
        foreground: readable(foreground, [tabBackground]),
        background: tabBackground,
        attributes: TextAttributes.BOLD,
      },
      inactive: { foreground: muted, background: defaultBackground },
    },
    priority: { urgent: red, high: yellow, mid: magenta, low: muted },
    border: { default: border },
    scrollbar: { thumb: border, track: elevated },
  };
}

export function contrast(a: RGBA, b: RGBA) {
  const x = luminance(a);
  const y = luminance(b);

  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function nativeColors() {
  const foreground = RGBA.defaultForeground();
  const background = RGBA.defaultBackground();
  const red = RGBA.fromIndex(1);
  const green = RGBA.fromIndex(2);
  const yellow = RGBA.fromIndex(3);
  const blue = RGBA.fromIndex(4);
  const magenta = RGBA.fromIndex(5);
  const cyan = RGBA.fromIndex(6);

  return {
    surface: { default: background, elevated: background },
    text: {
      default: foreground,
      muted: foreground,
      success: green,
      warning: yellow,
      error: red,
      info: cyan,
      accent: blue,
      secondary: magenta,
    },
    selection: { background, attributes: TextAttributes.INVERSE },
    tab: {
      active: { foreground, background, attributes: TextAttributes.INVERSE | TextAttributes.BOLD },
      inactive: { foreground, background },
    },
    priority: { urgent: red, high: yellow, mid: magenta, low: foreground },
    border: { default: foreground },
    scrollbar: { thumb: foreground, track: background },
  };
}

function parse(value: string | null | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? RGBA.fromHex(value) : undefined;
}

function mix(a: RGBA, b: RGBA, weight: number) {
  return RGBA.fromValues(
    a.r + (b.r - a.r) * weight,
    a.g + (b.g - a.g) * weight,
    a.b + (b.b - a.b) * weight,
  );
}

function readable(color: RGBA, backgrounds: readonly RGBA[], target = 4.5) {
  const score = (candidate: RGBA) => Math.min(...backgrounds.map((bg) => contrast(candidate, bg)));

  if (score(color) >= target) return color;

  const [lightness, a, b] = toOklab(color);
  let best = color;
  let bestScore = score(color);

  // Search outward to keep the smallest lightness change. Gamut mapping reduces
  // chroma without rotating the source hue. Unlike the reference's bounded
  // lightness bumps, this also considers black/white for low-contrast palettes.
  for (let step = 1; step <= 100; step++) {
    for (const direction of [-1, 1]) {
      const candidate = fromOklab(
        Math.max(0, Math.min(1, lightness + (direction * step) / 100)),
        a,
        b,
      );

      const candidateScore = score(candidate);

      if (candidateScore >= target) return candidate;

      if (candidateScore > bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }
  }

  // Some sets of backgrounds cannot share a 4.5:1 foreground. Prefer the
  // strongest minimum contrast rather than pretending the target was met.
  return best;
}

function linear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function srgb(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function luminance(color: RGBA) {
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

function toOklab(color: RGBA): readonly [number, number, number] {
  const r = linear(color.r);
  const g = linear(color.g);
  const b = linear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab(lightness: number, a: number, b: number) {
  let rgb = toLinearRgb(lightness, a, b);

  if (!inGamut(rgb)) {
    let low = 0;
    let high = 1;

    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;

      if (inGamut(toLinearRgb(lightness, a * mid, b * mid))) low = mid;
      else high = mid;
    }

    rgb = toLinearRgb(lightness, a * low, b * low);
  }

  return RGBA.fromValues(srgb(rgb[0]), srgb(rgb[1]), srgb(rgb[2]));
}

function inGamut(rgb: readonly number[]) {
  return rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
}

function toLinearRgb(lightness: number, a: number, b: number): readonly [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
