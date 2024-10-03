import { useDocChanged, useHelpers } from "@remirror/react";
import { useCallback } from "react";
import type { DocChangedOptions, GetHandler } from "remirror";

// Extracted from Remirror
// https://github.com/remirror/remirror/blob/b3c8b02f7562afb7de08b4308a3302a500386d33/packages/remirror__react-core/src/on-change.tsx
export const OnDocChange = ({
  onDocChanged,
}: {
  onDocChanged: NonNullable<GetHandler<DocChangedOptions>["docChanged"]>;
}): null => {
  const { getJSON } = useHelpers();

  useDocChanged(
    useCallback(
      (props) => {
        onDocChanged(props);
      },
      [onDocChanged, getJSON]
    )
  );

  return null;
};
