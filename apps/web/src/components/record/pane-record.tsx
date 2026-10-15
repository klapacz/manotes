import { getRouteApi } from "@tanstack/solid-router";
import { Option, Stream } from "effect";
import { Show, type ComponentProps } from "solid-js";
import Editor from "../../editor";
import {
  MatchTag,
  RecordCache,
  RecordSchema,
  bindRt,
  createAtomResultStore,
  createSyncedAtom,
} from "../../lib";
import * as RecordLink from "../../lib/record/link";
import { RecordCreate } from "./record-create";
import { PaneCtx } from "../../lib/record/pane.ctx";
import {
  RecordActions,
  RecordDivider,
  RecordShell,
  PaneEmptyState,
  PaneHeader,
  PaneShell,
} from "./shared";
import { Focus } from "./focus";

const route = getRouteApi("/$graph/");

export function PaneRecord(props: ComponentProps<"section">) {
  const navigate = route.useNavigate();
  const focus = Focus.use();
  const createRecord = RecordCreate.useCreateRecord();

  const handleCreate = () => {
    return createRecord({}, (record) => void navigate(RecordLink.getOptions({ id: record.id })));
  };

  const pane = PaneCtx.useRecord();
  const recordIdAtom = createSyncedAtom(() => pane().id);

  const recordsAtom = bindRt((rt) => {
    return rt.atom((get) => {
      return RecordCache.Service.use((cache) => cache.changes(get(recordIdAtom))).pipe(
        Stream.unwrap,
        Stream.map(Option.getOrNull),
      );
    });
  });

  const record = createAtomResultStore(recordsAtom);

  const fid = Focus.useId();

  // Entering the pane enters its only record, like a stream entering a row.
  const fnode = Focus.createNode(() => ({
    id: fid.pane(),
    focus: (element) => {
      Focus.focusBrowseTarget(element);
      focus.request(fid.record(pane().id));
    },
  }));

  fnode.registerShortcuts([
    {
      key: RecordCreate.shortcut,
      handler: () => {
        handleCreate();

        return true;
      },
    },
  ]);

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element as={PaneShell} {...props}>
        <PaneHeader onCreate={handleCreate} />
        <MatchTag
          when={record}
          cases={{
            Loading: () => null,
            Error: () => <PaneEmptyState>Failed to load record.</PaneEmptyState>,
            Success: (state) => (
              <Show
                when={state().value}
                // Only claim the record is missing once the query has answered;
                // rendering the fallback while loading flashes it on every pane open.
                fallback={<PaneEmptyState>Record not found.</PaneEmptyState>}
              >
                {(record) => <PaneRecordInner record={record()} />}
              </Show>
            ),
          }}
        />
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

function PaneRecordInner(props: { record: RecordSchema.Meta }) {
  const fnode = Focus.createRecordNode(
    () => props.record.id,
    () => ({ focus: Focus.focusBrowseTarget }),
  );

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element class="overflow-y-auto outline-none group">
        <RecordDivider date={props.record.date} />
        <RecordShell>
          <RecordActions record={props.record} />
          <Editor recordId={props.record.id} style={{ "min-height": "30svh" }} />
        </RecordShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}
