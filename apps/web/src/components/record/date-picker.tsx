import { RecordSchema } from "@manotes/shared/record.schema";
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

export function useChangeDate(props: { recordId: RecordSchema.Id; onChanged: () => void }) {
  const [, setDate] = useAtom(SetDate, { mode: "promiseExit" });

  return async (date: string) => {
    const exit = await setDate({ recordId: props.recordId, date });

    if (Exit.isFailure(exit)) return;

    props.onChanged();
  };
}

const SetDate = bindRt((rt) => {
  return rt.fn(
    Effect.fn("ComponentsRecordDatePicker.setDate")(function* (input: {
      readonly recordId: RecordSchema.Id;
      readonly date: string;
    }) {
      const service = yield* MaterializedEventService.Service;

      return yield* service.setDate({
        recordId: input.recordId,
        date: input.date,
        createdAt: yield* DateTime.now,
      });
    }),
  );
});

export * as RecordDatePicker from "./date-picker";
