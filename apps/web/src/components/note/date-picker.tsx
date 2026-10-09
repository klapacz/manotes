import { useAtom } from "@effect/atom-solid";
import { DateTime, Effect } from "effect";
import { MaterializedEventService, bindRt } from "../../lib";
import { DateCommand } from "./date-command";

export function Menu(props: {
  date: string;
  onChange: (date: string) => void;
  onBack: () => void;
}) {
  return (
    <DateCommand.Root
      label="Change date"
      value={props.date}
      initialText=""
      onChange={props.onChange}
      onBack={props.onBack}
    />
  );
}

export function useChangeDate(props: { noteId: string; onChanged: () => void }) {
  const [result, setDate] = useAtom(SetDate, { mode: "promise" });

  return async (date: string) => {
    if (result().waiting) return;

    try {
      await setDate({ noteId: props.noteId, date });
      props.onChanged();
    } catch {}
  };
}

const SetDate = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNoteDatePicker.setDate")(function* (input: {
      readonly noteId: string;
      readonly date: string;
    }) {
      const service = yield* MaterializedEventService.Service;

      return yield* service.setDate({
        noteId: input.noteId,
        date: input.date,
        createdAt: yield* DateTime.now,
      });
    }),
  ),
);

export * as NoteDatePicker from "./date-picker";
