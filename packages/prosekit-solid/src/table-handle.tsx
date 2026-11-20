// Generated property/event inventory from @prosekit/solid 0.8.3 dist/table-handle.js.
import { webComponent } from "./web-component";
import {
  registerTableHandleRootElement,
  registerTableHandleColumnPositionerElement,
  registerTableHandleColumnPopupElement,
  registerTableHandleColumnMenuRootElement,
  registerTableHandleColumnMenuTriggerElement,
  registerTableHandleRowPositionerElement,
  registerTableHandleRowPopupElement,
  registerTableHandleRowMenuRootElement,
  registerTableHandleRowMenuTriggerElement,
} from "prosekit/web/table-handle";

export const TableHandleRoot = webComponent(
  "prosekit-table-handle-root",
  registerTableHandleRootElement,
  ["editor"],
  [],
);

export const TableHandleColumnPositioner = webComponent(
  "prosekit-table-handle-column-positioner",
  registerTableHandleColumnPositionerElement,
  [
    "altBoundary",
    "autoUpdate",
    "boundary",
    "editor",
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

export const TableHandleColumnPopup = webComponent(
  "prosekit-table-handle-column-popup",
  registerTableHandleColumnPopupElement,
  [],
  [],
);

export const TableHandleColumnMenuRoot = webComponent(
  "prosekit-table-handle-column-menu-root",
  registerTableHandleColumnMenuRootElement,
  ["defaultOpen", "disabled", "open"],
  [],
);

export const TableHandleColumnMenuTrigger = webComponent(
  "prosekit-table-handle-column-menu-trigger",
  registerTableHandleColumnMenuTriggerElement,
  ["editor"],
  [],
);

export const TableHandleRowPositioner = webComponent(
  "prosekit-table-handle-row-positioner",
  registerTableHandleRowPositionerElement,
  [
    "altBoundary",
    "autoUpdate",
    "boundary",
    "editor",
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

export const TableHandleRowPopup = webComponent(
  "prosekit-table-handle-row-popup",
  registerTableHandleRowPopupElement,
  [],
  [],
);

export const TableHandleRowMenuRoot = webComponent(
  "prosekit-table-handle-row-menu-root",
  registerTableHandleRowMenuRootElement,
  ["defaultOpen", "disabled", "open"],
  [],
);

export const TableHandleRowMenuTrigger = webComponent(
  "prosekit-table-handle-row-menu-trigger",
  registerTableHandleRowMenuTriggerElement,
  ["editor"],
  [],
);
