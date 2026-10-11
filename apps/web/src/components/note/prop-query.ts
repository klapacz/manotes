import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Predicate } from "effect";
import { MenuQuery } from "../../lib/menu-query";

export function boolQuery(opts: { defaultValue: boolean | undefined }) {
  return MenuQuery.choices(() =>
    [true, false].map((val) => ({
      value: String(val),
      label: val ? "True" : "False",
      propVal: AttrsSchema.PropVal.cases.bool.make({ val }),
      detail: val === opts.defaultValue ? () => "Default" : undefined,
    })),
  );
}

export function valueLabel(value: AttrsSchema.PropVal): string {
  if (Predicate.isTagged(value, "bool")) return value.val ? "True" : "False";

  return String(value.val);
}

export * as PropQuery from "./prop-query";
