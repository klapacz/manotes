import type { StyledProps } from "../../lib/cva";
import { omit } from "solid-js";
import * as SDK from "@ui-sdk/solid/switch";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid (commit 4c75b89, using @kobalte/core 0.13.11 / solid-js 1.9.10).
// Source: apps/docs/src/registry/ui/switch.tsx
// Why: the agent setup dialog needed an on/off control, and this app had no switch primitive.
// Modifications: rebuilt on @ui-sdk/solid's switch with the thumb inside, replaced registry alias
// imports with the local cva helper, and mapped styles to Manotes tokens.
export type SwitchProps = StyledProps<typeof SDK.Switch>;

export const Switch = (props: SwitchProps) => {
  const rest = omit(props, "class", "children");

  return (
    <SDK.Switch
      data-slot="switch"
      class={cx(
        "bg-border inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all",
        "data-[checked]:bg-primary-solid",
        "focus-visible:border-primary-border focus-visible:ring-primary-border/30 focus-visible:ring-[3px] focus-visible:outline-none",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        props.class,
      )}
      {...rest}
    >
      <SDK.SwitchThumb
        data-slot="switch-thumb"
        class="bg-bg pointer-events-none size-4 rounded-full transition-transform data-[checked]:translate-x-[calc(100%-2px)] data-[checked]:bg-primary-fg-solid"
      />
    </SDK.Switch>
  );
};
