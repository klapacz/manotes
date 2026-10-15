import { useAtom } from "@effect/atom-solid";
import { DateTime, Effect, Exit } from "effect";
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
      onChange={props.onChange}
      onBack={props.onBack}
      onClear={undefined}
    />
  );
}

export function useChangeDate(props: { noteId: string; onChanged: () => void }) {
  const [, setDate] = useAtom(SetDate, { mode: "promiseExit" });

  return async (date: string) => {
    const exit = await setDate({ noteId: props.noteId, date });

    if (Exit.isFailure(exit)) return;

    props.onChanged();
  };
}

const SetDate = bindRt((rt) => {
  return rt.fn(
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
  );
});

export * as NoteDatePicker from "./date-picker";
