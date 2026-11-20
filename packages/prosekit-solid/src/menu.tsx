// Generated property/event inventory from @prosekit/solid 0.8.3 dist/menu.js.
import { webComponent } from "./web-component";
import {
  registerMenuPositionerElement,
  registerMenuPopupElement,
  registerMenuItemElement,
} from "prosekit/web/menu";

export const MenuPositioner = webComponent(
  "prosekit-menu-positioner",
  registerMenuPositionerElement,
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

export const MenuPopup = webComponent(
  "prosekit-menu-popup",
  registerMenuPopupElement,
  ["eventTarget"],
  [],
);

export const MenuItem = webComponent(
  "prosekit-menu-item",
  registerMenuItemElement,
  ["closeOnSelect", "disabled", "value"],
  ["select"],
);
