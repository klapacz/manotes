import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";

import { defineConfig } from "cva";
import { twMerge } from "tailwind-merge";

export const { cva, cx, compose } = defineConfig({
  hooks: {
    onComplete: (className) => twMerge(className),
  },
});

export type StyledProps<T extends ValidComponent> = {
  [K in keyof ComponentProps<T>]: K extends "class"
    ? string
    : K extends "children"
      ? JSX.Element
      : ComponentProps<T>[K];
};
