import { getRouteApi } from "@tanstack/solid-router";
import type { PaneSchema } from "@manotes/shared/record/pane.schema";
import { PaneCtx } from "./pane.ctx";
import { PaneCursor } from "./pane.cursor";
import { PaneScroll } from "./pane.scroll";

const route = getRouteApi("/$graph/");

export function useOpenNext(): (input: PaneSchema.PaneInput) => void {
  const ctx = PaneCtx.use();
  const scroll = PaneScroll.use();
  const navigate = route.useNavigate();

  return (input) => {
    if (scroll.scrollToPane(input).found) return;
    void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(input)));
  };
}

export * as PaneNavigate from "./pane.navigate";
