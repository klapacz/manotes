import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { createStreamRefLabel } from "../../lib/editor/stream-ref/extension";
import { PaneNavigate } from "../../lib/record/pane.navigate";
import { ArrowUpRightIcon } from "../icons";
import { Button } from "../ui/button";

export function StreamFilterLink(props: {
  filter: AttrsSchema.Filter | undefined;
  source: typeof PaneSchema.Source.Type;
}) {
  const openNext = PaneNavigate.useOpenNext();

  const settings = (): StreamSettings.Settings => ({
    ...StreamSettings.defaultDisplay,
    filter: props.filter ?? [],
  });

  const label = createStreamRefLabel(settings);

  const open = () => {
    return openNext(
      PaneSchema.make.stream({
        ...settings(),
        source: props.source,
      }),
    );
  };

  return (
    <Button variant="ghost" size="xs" inline onClick={open}>
      {label()}
      {"\u00a0"}
      <ArrowUpRightIcon />
    </Button>
  );
}
