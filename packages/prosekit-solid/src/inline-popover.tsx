// Generated property/event inventory from @prosekit/solid 0.8.3 dist/inline-popover.js.
import { webComponent } from "./web-component";
import {
  registerInlinePopoverRootElement,
  registerInlinePopoverPositionerElement,
  registerInlinePopoverPopupElement,
} from "prosekit/web/inline-popover";

export const InlinePopoverRoot = webComponent(
  "prosekit-inline-popover-root",
  registerInlinePopoverRootElement,
  ["anchor", "defaultOpen", "disabled", "dismissOnEscape", "editor", "open"],
  ["openChange"],
);

export const InlinePopoverPositioner = webComponent(
  "prosekit-inline-popover-positioner",
  registerInlinePopoverPositionerElement,
  [
    "altBoundary",
    "autoUpdate",
    "boundary",
    "elementContext",
    "fitViewport",
    "flip",
    "hide",
    "hoist",
    "inline",
    "offset",
    "overflowPadding",
    "overlap",
    "placement",
    "rootBoundary",
    "sameHeight",
    "sameWidth",
    "shift",
    "strategy",
  ],
  [],
);

export const InlinePopoverPopup = webComponent(
  "prosekit-inline-popover-popup",
  registerInlinePopoverPopupElement,
  [],
  [],
);
