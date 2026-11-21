import { RecordFormat } from "@manotes/shared/record/format";
import { RecordSchema } from "@manotes/shared/record.schema";
import { Option, Stream } from "effect";
import { createMemo, Errored, Loading } from "solid-js";
import { RecordCache, useGraphStream } from "../../lib";

export function Root(props: { id: RecordSchema.Id }) {
  const record = useGraphStream(() => {
    const id = props.id;

    return RecordCache.Service.use((cache) => cache.changes(id)).pipe(Stream.unwrap);
  });

  const label = createMemo(() => {
    return Option.match(record(), {
      onNone: () => "Unavailable record",
      onSome: RecordFormat.queryLabel,
    });
  });

  return (
    <Errored fallback={<Label text="Unable to load record" />}>
      <Loading fallback={<Label text="" />}>
        <Label text={label()} />
      </Loading>
    </Errored>
  );
}

function Label(props: { text: string }) {
  return (
    <span class="min-w-0 truncate" title={props.text}>
      {props.text}
    </span>
  );
}

export * as RecordLabel from "./record-label";
