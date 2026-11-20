// Generated property/event inventory from @prosekit/solid 0.8.3 dist/autocomplete.js.
import { webComponent } from "./web-component";
import {
  registerAutocompleteRootElement,
  registerAutocompletePositionerElement,
  registerAutocompletePopupElement,
  registerAutocompleteItemElement,
  registerAutocompleteEmptyElement,
} from "prosekit/web/autocomplete";

export const AutocompleteRoot = webComponent(
  "prosekit-autocomplete-root",
  registerAutocompleteRootElement,
  ["anchor", "editor", "filter", "followCursor", "queryBuilder", "regex"],
  ["openChange", "queryChange", "valueChange", "valuesChange"],
);

export const AutocompletePositioner = webComponent(
  "prosekit-autocomplete-positioner",
  registerAutocompletePositionerElement,
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

export const AutocompletePopup = webComponent(
  "prosekit-autocomplete-popup",
  registerAutocompletePopupElement,
  [],
  ["valueChange", "valuesChange"],
);

export const AutocompleteItem = webComponent(
  "prosekit-autocomplete-item",
  registerAutocompleteItemElement,
  ["disabled", "value"],
  ["select"],
);

export const AutocompleteEmpty = webComponent(
  "prosekit-autocomplete-empty",
  registerAutocompleteEmptyElement,
  [],
  [],
);
