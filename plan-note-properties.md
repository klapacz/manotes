The agreed model is:

Records have fixed kinds: ordinary notes, property definitions, enum options, and schema rules. Non-note kinds stay outside normal note flows.

User-created records support the same rich-text body as notes.

Definitions and enum choices have stable identities and renameable labels. Duplicate property names are allowed.

Numbers hold one value. Text, enums, and note references support one value or a Set, as configured by the user.

type is an ordinary user property. Schema rules apply expectations through filters; multiple rules can apply.

Custom-definition changes preserve existing values. Missing or mismatched values produce reviewable warnings.

Archiving definitions or choices preserves their content and assignments, marks existing uses, and allows restoration.

Built-in definitions are immutable and hidden from ordinary editing, with a builtin badge wherever exposed. Their values remain available to controls, queries, and clients.

Property references don’t contribute to backlinks initially.

## Further design decisions

These decisions extend the reference text above. Server-visible properties and server filtering are deferred entirely.

- The fixed record kind identifies notes, property definitions, enum options, and schema rules without using another user-defined property. Definition and option records may contain the same rich-text body as notes. Their H1 provides their display name, including enum choice names.
- User-created definitions may change kind or single/Set cardinality after use. Preserve existing values and report mismatches; never silently convert or discard them.
- Archiving a note, custom definition, or enum option is reversible. Preserve record identities, content, and existing assignments. Hide archived definitions/options from ordinary pickers, mark existing uses, and allow restoration. Built-in definitions remain protected.
- Numbers are single-value. Text, enums, and note references allow single-value or Set, as chosen in the definition. Enum choices and references are distinct and use stable choice/note identities.
- `type` is a user-defined property, potentially a Set. Schema expectations apply to notes matching a filter, rather than introducing a separate hard-coded note type system. Several rules may apply simultaneously.
- Schema filters should reuse the shape used by stream links. Expected fields may be required or optional. Matching a schema displays missing fields without writing empty values; removing a match removes suggestions but preserves entered values.
- Reference selection uses filters to show suitable target notes. If an assigned target stops matching, preserve the assignment and show a warning.
- Missing or incompatible property values are saveable. Show warnings in ordinary streams as well as a review stream for notes that do not match expectations.
- Property references do not contribute to backlinks initially. Relationships can be queried through property filters. Non-note record kinds remain hidden from normal note flows.
- Property definitions are browsed and edited using streams with a record-kind filter. Extend the create control to choose the record kind. A definition created while adding a property is the same reusable record.
- Built-in definitions are immutable and hidden from ordinary property editing. Their values remain usable in app controls, filters, queries, and CLI output. Display a `builtin` badge where protected properties appear. Custom properties may share a built-in's display name without sharing its identity or behavior.
- Archive affects streams only. Provide an option to show archived notes. Opening an archived note shows its status and a restore control. Existing open streams preserve rows until Refresh; no special immediate-removal logic.
- Missing archive values mean active. Archiving sets the built-in value to true; restoration removes it.

## Implementation direction

Implement the smallest usable version of the agreed shape, choosing the simpler option when details remain open. Establish only the shared record/property foundation needed by the implemented flows; extend it later. All property data remains encrypted.

Rebase workspace/02 onto the sand bookmark before implementation. Assume fresh graphs: no old-data migration or compatibility with a property-less system is required. Use generated database migrations for schema changes.

Run the required vp check --fix, start the development server, and validate the implemented flows in the collaborative web browser. Add tests only when they help debug behavior that is easy to break.

## Implemented slice and validation

The minimal usable slice includes reusable definitions, named enum-option records with editable bodies, note references, scalar/Set assignments, schema expectations with stream-shaped filters, ordinary-stream warnings and a review filter, property stream filters, and archive/restore for user-created records. Number definitions are single-value. The protected Archived definition is installed through a deterministic encrypted update event when the graph's property catalog opens. CLI materialized Markdown includes record metadata.

All property/configuration edits share the note's Yjs document and existing encrypted event/snapshot pipeline. Set members use independently addressable Yjs map entries. The local materialized catalog supplies labels, schema checks, pickers, and stream matching; property indexing and larger filter expressions are deferred. UI selectors use simple native controls.

Validated on a fresh local graph in the collaborative browser: creation, editable enum names/descriptions, stable assignments after renaming, enum and note-reference assignment, required and target-filter warnings, review/property streams, Set additions/removal, definition kind/cardinality changes preserving old data, number correction, archive retaining rows until Refresh, Show archived, restoration, and persistence across reloads. Browser assertions checked concurrent Set additions, replicated member removal, archive removal, and identical built-in seed updates. The required `vp check --fix` also passes. No additional test suite was run.

## Prototype refinements

The stream selector combines Notes, Pages, Properties, and Rules. UI calls schema rules simply Rules. Archive and review switches are removed; property filters handle those queries. New streams default to `Archived equals false`. The filter count is hidden when the property conditions equal that default, shown for other nonempty conditions, and replaced with `!` when all conditions have been removed. Reset in the property-filter modal restores the default condition while preserving the stream's other filters and settings.

Definitions can carry a default value, used for comparisons and validation when there is no assignment. Archived defaults to false. Defaults do not write assignments: `is set true/false` checks explicitly entered values. `is invalid true/false` uses the same validation as property warnings, including required fields and reference target filters. The former separate is-empty operation is removed.

Entering a value now uses only the definition's current kind and cardinality, and reference/enum pickers allow only valid choices. Definition changes still preserve previous assignments, which may become invalid. Show those invalid values and their specific warnings in the property row. The user can remove individual Set members or clear the assignment before entering a replacement. Clearing remains allowed even when a rule requires a value. The edit service also checks newly entered values; unrelated warnings do not block editing.

Validated in a fresh browser graph: Notes/Pages selector, default Archived filter and hidden count, changed filter showing (1), is-set false matching absent Archived assignments, is-invalid filtering a mismatched assignment, number-only entry and disabled empty number save, definition changes preserving and displaying the invalid number with its reason, and manual clearing restoring the correct editor. Browser assertions also checked defaults, boolean set/invalid filters, default-filter identity, and a self-referential rule terminating.

Archived now uses the ordinary property editing flow. Remove Archive/Restore actions, including enum-option shortcuts, and the special archived banner. Allow selecting Archived through Add property, editing its boolean value to true or false, and clearing it. Keep the default stream filter. Built-in definitions display their normal configuration and property controls, disabled, with the builtin badge. Built-in content remains uneditable; this protection is based on builtin status rather than Archived's identity. Browser validation confirmed true and false saves, absence of the archive actions/banner, and disabled controls on the Archived definition.

Remove Create property from record property panels. The pane's + creates directly from its context rather than offering a kind menu: note/page streams create notes/pages, property streams create definitions, and rule streams create rules. Opening a single record uses that record's kind for creation. New records use Untitled where an H1 is needed and are edited in place. An ordinary note/page with no assigned property values hides the properties panel until the user chooses Add properties from its existing note menu. Schema warnings remain visible. Browser validation confirmed direct creation without a kind picker, an empty note with no properties panel, Add properties revealing the ordinary Archived picker, and direct Rules creation.

Valid scalar values appear directly in their inputs/pickers, without a separate Current label or Save button. Pickers persist changes immediately. Text and numbers persist on blur or Enter; Set inputs add a completed member the same way. Invalid stored values retain their visible value and warning with Clear. Empty/nonfinite numeric edits revert to the stored value rather than saving invalid data. Browser validation confirmed immediate boolean saving and text saving on blur, with both values retained after reload.

Property rows use a native description list, with muted labels and compact borderless value controls side by side, inspired by the supplied Intent UI description list and Linear reference. Labels use the same text size as Add property. The clear action is an accessible X grouped with its value control, and a separator divides note content from the properties panel. Built-in records use the same rich-text editor as other records in both streams and note panes, using the editor's read-only extension instead of a separate title fallback. Editing menus are hidden in read-only editors; definition controls remain visible and disabled. Browser checks confirmed ordinary/built-in editors were editable/read-only respectively, definition controls were disabled, row labels and controls aligned, the X directly adjoined its control, and the separator rendered.

Keep the separator inset by the note's 16px content padding, without negative offsets on property labels. Add property and clickable labels share their control height, padding, text size, and row spacing. Filtering uses the same compact description-list rows and X removal control; boolean definitions offer is set, is invalid, and equals, without contains. Property editors show explicit assignments, so clearing a boolean shows Choose instead of its effective default. The cleared row remains available during the current interaction. Defaults continue to apply in filters and validation. Browser checks confirmed matching label/Add property padding, the restricted boolean operators in the styled filter modal, and clearing to an unset picker.

X clears an assigned value to an unset picker; when already unset it removes the row from the current list and makes it available through Add property again. Removing an empty suggested field hides that row locally without changing schema expectations or their warnings. The shared comparison-operation map offers exactly one comparison: equals for scalar values, contains for text/enum/reference Sets, and equals for numbers and booleans. Is set and is invalid remain available for every property. Browser checks confirmed the clear-then-remove behavior, re-adding a removed row, and the comparison map for all value types.

Rules replace their embedded matching-filter editor with a stream link. It opens a stream beside the rule using the rule's saved filter. The pane carries the rule ID and displays its name; changes to search, record kind, and property conditions save that filter to the rule immediately. Reset also updates the rule. Sorting and display settings remain local to the stream. Expected properties stay in the rule's panel. Ordinary streams remain independent. Browser validation confirmed live property-condition changes, removal and Reset, search/type changes, and persisted filters after reloading and reopening the rule.

Rule configuration uses the same compact description-list rows as note properties, without a separate bordered form. The Matches row shows a backlink-style stream reference describing the actual conditions, including property names and values rather than only Notes or a condition count. Expected-property rows use navigable muted property labels, Required/Optional pickers, and an X grouped with the picker. Add expected property uses the same compact control styling.

Matches and Expected properties are separate groups with their labels above their content. Remove the redundant Rule label. Ordinary property assignments form a separate section with a divider on configured records. Every record kind hides its empty ordinary-property section until Add properties is selected in the note menu, using the same behavior as notes. Add expected property and Add property share their 14px text, 28px height, 8px horizontal padding, and row spacing. Definition and enum-owner configuration also use the same aligned compact controls; enum-option links and creation controls follow that spacing.

Invalid assignments show only `Invalid value: …` beside the field and its clear X, including invalid Sets. Remove the top-level warning notice and repeated validation/correction text. Missing required values remain indicated beside their own empty fields.

An enum option's owning enum is fixed at creation. Its Enum row links to that definition instead of offering a picker; property edits reject reassigning it to another enum.

Reference expectations open their target filter in a linked stream pane, bound to the rule and expected property's ID. Changes update that expectation's target filter without changing the rule's matching filter. Disabling Filter available values removes the restriction. Enum expectations instead offer Restrict enum options and a checklist of their options, whose names link to their descriptions. Unrestricted enums allow every active option; enabling restriction initially selects all active options. An explicit empty selection allows none. New options are automatically allowed only in unrestricted mode. Existing excluded or archived assignments remain stored and show as invalid. Multiple applicable rules combine their restrictions. Browser checks confirmed live target filtering, separate pane bindings, persistence, restricted reference choices, enum selection, and preservation of excluded assignments.

The Notes/Pages distinction based on H1 presence applies only to ordinary notes. Rules, definitions, and enum options remain listed by their fixed record kind when their title is removed.

## Prototype refinements

- Date filters select one concrete date, using main's natural-language suggestions or YYYY-MM-DD.
- Reference target filters belong to property definitions, edited through their linked stream. Rules only configure required/optional for references for now.
- Both note value pickers and property-filter value pickers restrict references to the definition's matching targets. Existing assignments that stop matching remain visible as invalid values.

- Reference filtering is always active, with active Pages as the initial target filter. Its link is always shown on the definition, without an enable/disable toggle.

## Scalar rebuild design, 2026-10-09

This section records the current agreement for the rebuild. It supersedes earlier prototype storage and filter sketches where they differ. The existing prototype remains a reference; this change does not implement the rebuild.

The first implementation supports one value per property. Do not implement multiple values, Set controls, assignment modes, or enum-option restrictions yet. Server-visible properties and server filtering remain deferred. Use the existing encrypted Yjs update events; no new event type is required.

### Yjs layout and types

Each record has one Y.Doc containing the existing ProseMirror fragment and a root Y.Map named `attrs`. `props` and `rule_expects` are nested Y.Maps. Initialize the nested maps during record creation and reuse their shared identities when syncing or repairing a record. Do not routinely replace a nested map, which would replace its independently edited entries.

The following TypeScript sketch describes the intended key/value types, not a guarantee that replicated data satisfies them. Metadata specific to another record kind may be absent. Raw Yjs reads remain untrusted.

```ts
import type * as Y from "yjs";

type Attrs = {
  _tag: "note" | "prop" | "enum" | "rule";
  builtin?: boolean; // Absent = false

  // Property definition
  prop_type?: ValTag;
  prop_default?: PropVal;
  prop_targets?: Filter; // Link scope: atomic JSON

  // Rule
  rule_targets?: Filter; // Matching filter: atomic JSON
  rule_expects?: Y.Map<{
    required: boolean;
  }>; // Key = property's note ID; each expectation is atomic JSON

  // Enum option; its H1 is its name and its body can describe it
  enum_parent?: NoteId; // Owning property's note ID

  // Assignments on any record; each value is atomic JSON
  props: Y.Map<PropVal>; // Key = property's note ID
};

type NoteId = string;

type PropVal =
  | { _tag: "text"; val: string }
  | { _tag: "number"; val: number }
  | { _tag: "bool"; val: boolean }
  | { _tag: "enum"; val: NoteId } // Option's note ID
  | { _tag: "link"; val: NoteId };

type ValTag = PropVal["_tag"];

type Filter = FilterExpr[]; // Implicit AND

type FilterExpr = { _tag: "and" | "or"; val: FilterExpr[] } | { _tag: "cmp"; val: FilterCmp };

type FilterCmp =
  | ["_tag", "=", Attrs["_tag"]]
  | ["title", "exists", boolean]
  | ["body", "contains", string]
  | ["date", "=", string] // Validated YYYY-MM-DD calendar date
  | [["link", "->" | "<-", NoteId], "exists", true]
  | [["prop", NoteId], "=", PropVal]
  | [["prop", NoteId], "exists", boolean]
  | [["prop", NoteId], "invalid", boolean];
```

`prop_targets` and `rule_targets` are plain JSON values assigned under their respective map keys. An edit replaces the whole filter. Concurrent edits resolve to one complete value under Yjs map conflict resolution; filter expressions are not merged. This does not promise wall-clock last-write ordering.

`rule_expects` is keyed by property note ID, without separate expectation IDs. Independent expected properties merge independently. Updating the same expectation replaces its whole JSON value. There is no `allowedOptions` field in the first implementation.

Titles are derived from content, not stored in `attrs`. Notes and Pages are UI presets over record tag plus title presence:

```ts
const notes: Filter = [
  { _tag: "cmp", val: ["_tag", "=", "note"] },
  { _tag: "cmp", val: ["title", "exists", false] },
];

const pages: Filter = [
  { _tag: "cmp", val: ["_tag", "=", "note"] },
  { _tag: "cmp", val: ["title", "exists", true] },
];
```

A user-defined Type property remains an ordinary assignment keyed by its definition's note ID. It is unrelated to the reserved record tag or the Notes/Pages presets.

`->` means the candidate has a content link to the selected note. `<-` means the selected note has a content link to the candidate. Link predicates only support `exists: true` in this slice. Property assignments do not contribute to content backlinks.

Property equality uses the effective value, including a definition's default when no explicit value exists. Property `exists` checks an explicit assignment independently of defaults. Missing Archived resolves to false without writing an assignment. A value's `_tag` records the type originally assigned; `prop_type` records what the definition currently expects. Changing the definition preserves existing values so mismatches can be reviewed and repaired.

Root arrays and `and` groups have AND semantics; an empty AND matches everything. An empty OR matches nothing. Keep unknown future expressions intact and mark them unsupported rather than silently ignoring them or treating them as matching everything.

### Validation, materialization, and repair

Use Effect discriminated schemas for values, record metadata, expectations, and filter expressions. Derive TypeScript types from the schemas in implementation. Validate finite numbers, actual calendar dates, IDs, and recursive expressions at runtime. Creation commands require the fields needed for the selected record tag, including `prop_type` for a property and `enum_parent` for an option.

Do not trust replicated Yjs state merely because local creation and write commands are validated. Fields may be missing, have an unexpected type, reference unavailable records, or conflict with other metadata. The optional storage sketch intentionally permits representing incomplete records. A validated domain view can use a strict discriminated union, but an invalid replicated record must still be representable and repairable.

The materializer should preserve the Yjs snapshot and raw data, record validation failures, and continue processing other records. Do not let a malformed metadata field permanently stall the event log, discard the record, silently substitute a guessed enum parent, or overwrite an invalid value with a default. Backfill through ordinary validated Yjs edits when the user repairs missing or invalid metadata. A missing enum parent can be filled in; normal editing must not move an already valid option to another enum.

Project structural validity into SQL. The proposed property and rule tables should carry `is_valid`, maintained by materialization, so invalid metadata can be listed and repaired through database queries. `is_valid` is derived state, not another Yjs attribute. Missing or invalid metadata columns must remain nullable in the projection so the invalid row can exist. Preserve diagnostics alongside the validity result in a form to be decided. Decide where enum-option and unknown-tag validity is projected when agreeing the SQL schema; those records need a repair path too.

Structural record validity and invalid assignments are distinct. A valid property definition can have notes assigned values that no longer match it. Required-field warnings also depend on which rules match the note. Definition changes, rule changes, option archiving, and link-scope changes can affect other notes without changing their own Yjs documents. Database validation queries must use current definitions and targets, or explicitly refresh affected validation projections; do not assume materializing only the edited note refreshes all dependent validity.

A record's `props` must not contain an assignment keyed by its own note ID. In particular, the Archived definition cannot assign Archived to itself. Enforce this on writes and detect it while materializing replicated data. Built-in records remain protected.

This direct-self-use restriction does not resolve every validation cycle. A rule can match `Priority invalid` and also contribute to Priority's validation; property scopes can depend on each other. The meaning of `invalid` inside persisted rule targets and property scopes, and how to handle multi-record cycles, remains an open design decision. Record the failure visibly rather than allowing unbounded recursion or claiming the self-use restriction solves it.

Keep a small typed access boundary for Yjs. Writes should tie the key to its value type, so a boolean cannot be written as `prop_type`. For example, this is the intended compile-time shape, not an implemented helper:

```ts
interface AttrAccess {
  getRaw(key: keyof Attrs): unknown;
  set<K extends keyof Attrs>(key: K, value: NoInfer<Exclude<Attrs[K], undefined>>): void;
  delete(key: keyof Attrs): void;
}
```

Runtime decoding with Effect is still required for reads and writes. A typing library must not turn unvalidated replicated data into a trusted `Attrs` through a cast alone.

### Materialized SQL direction

Yjs and the existing encrypted event log remain the source of truth. SQL is a relational projection used to fetch, filter, and list missing or invalid assignments without loading every note into the application.

- Add indexed record kind/tag to `notes`; exact column naming is still to be agreed.
- `properties` extends the corresponding note with queryable definition metadata. Its ID is the same note ID, whose record tag is `prop`.
- `rules` extends the corresponding note with its filter. Its ID is the same note ID, whose record tag is `rule`.
- `note_properties` associates a note and a property definition with one typed scalar value. Preserve the value's original tag, independently of the definition's current type.
- `rule_properties` associates a rule and a property definition with its required flag. Its key is the pair of note IDs; no additional expectation identity is needed.
- Enum option records use their own note IDs and `enum_parent` to identify the owning property. Choose their exact SQL projection in the database design slice.

One possible querying strategy fetches current definitions and rules first, then compiles the filter tree and validation checks into SQL. Missing required values must account for effective defaults. Invalid assignments include type mismatches, unavailable or archived options/targets, wrong enum ownership, and link targets outside the property's scope. The exact tables, indexes, and validation query plan still need agreement before implementation.

### Adding Sets later

Keep the scalar representation above unchanged in the first implementation. Do not store an unused false `multiple` flag or create Set maps now. Later add definition cardinality and actual assignment mode independently, with absent mode/cardinality interpreted as single. Names in the following extension sketch are tentative:

```ts
// Future keys under attrs
prop_mode?: "single" | "set" // Definition's expected cardinality
prop_modes?: Y.Map<"single" | "set"> // Property ID -> actual assignment mode
prop_sets?: Y.Map<Y.Map<PropVal>> // Property ID -> independently editable members
```

Existing scalar values remain in `attrs.props`; no rewrite of existing scalar Yjs assignments is needed. The effective assignment reader uses `props` when mode is absent or single, and the appropriate `prop_sets` member map when mode is set. Retain previous values when a definition's cardinality changes and report a mismatch instead of silently converting or dropping them. Switching an individual assignment's mode or converting its values is an explicit edit, distinct from changing the definition.

Each Set member has a stable key based on a canonical serialization of `{ _tag, val }`, including the value tag. Duplicate members share a key. Different members are independent Yjs map entries; adding or removing one must not replace the whole Set. Initialize and reuse the nested map identities instead of replacing them during unrelated edits. Concurrent creation of a previously absent member map needs a defined initialization strategy and a regression check so one branch's members are not lost behind a replaced nested map. Concurrent add/remove of the same member follows Yjs map semantics; do not promise an observed-remove Set without separately designing one.

In SQL, add a membership table with a composite key such as `(note_id, property_id, value_key)` alongside the scalar assignment projection. Store each member's typed value and preserve actual assignment mode separately from expected definition cardinality. An absent mode remains scalar. Database migrations may add tables or columns, but existing scalar event payloads remain readable without rewriting the event log.

Text, enum, and link definitions may eventually support Sets. Numbers stay single-value; booleans stay scalar in this design. Add the relevant comparison operator for membership only when implementing Sets, without changing the meaning of existing equality or presence predicates.

If enum restrictions are added later, extend each expectation's atomic JSON object with optional option note IDs, or a separately agreed representation. Absent restrictions mean all otherwise valid options are available. This is independent of adding Sets.

### Typed Yjs library research, 2026-10-09

The project currently resolves Yjs 13.6.27. No dependency was installed or changed for this research. These findings concern the inspected versions and sources, not a compatibility test in Manotes.

| Candidate                                                                                    | What it supplies                                                                                                                 | Fit for this design                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [yjs-types](https://github.com/strangecamelcaselogin/yjs-types), published 0.0.1             | Typing-only `TypedMap` and `TypedDoc`. `get` and `set` tie a field name to its declared value type; map reads include undefined. | Closest small library to the requested typed accessor. Its documented construction uses type assertions. It does not validate replicated values, dates, filters, references, or materialized validity. Effect decoding is still necessary.                                                                                        |
| [y-typed](https://github.com/raimohanska/y-typed)                                            | A study of structural map/document types, typed initialization, and restrictions on deleting required fields.                    | The source explicitly calls itself incomplete. Reads of required fields can claim a present value without checking replicated state. Useful reference, not a recommendation to install for this slice.                                                                                                                            |
| [SyncedStore](https://syncedstore.org/docs/advanced/yjs/), published @syncedstore/core 0.6.0 | Typed object/array proxies over Yjs plus reactive bindings.                                                                      | A broader state-management layer. Objects are collaborative by default, so filters, property values, and expectation objects need [boxed values](https://syncedstore.org/docs/advanced/boxed/) to preserve atomic replacement. It adds proxy/reactivity behavior we do not need for the existing Effect/materialization pipeline. |

Sources inspected:

- [yjs-types TypedMap source](https://github.com/strangecamelcaselogin/yjs-types/blob/main/src/index.ts) and [package metadata](https://github.com/strangecamelcaselogin/yjs-types/blob/main/package.json). Version 0.0.1 declares Yjs ^13.5.29 as its peer dependency. The publisher's [npm registry metadata](https://registry.npmjs.org/yjs-types) reports that release on 2023-03-01.
- [y-typed source](https://github.com/raimohanska/y-typed/blob/master/src/yTyped.ts) and repository README. This supplies type interfaces and casts, not Effect runtime validation.
- SyncedStore's official [Yjs integration](https://syncedstore.org/docs/advanced/yjs/), [boxed values](https://syncedstore.org/docs/advanced/boxed/), and [API](https://syncedstore.org/docs/api/) documentation. The publisher's [npm registry metadata](https://registry.npmjs.org/@syncedstore%2fcore) reports version 0.6.0 on 2023-10-15, with Yjs ^13.5.13 as its peer dependency.

Recommendation for discussion: keep native Yjs and a small key-typed access boundary driven by the Effect schemas. If we want an external typing layer, evaluate yjs-types first, but use its trusted read types only after runtime validation. No candidate inspected replaces the materializer's invalid-state handling or the repair workflow. Do not install one based on this research alone; the accessor implementation is a later agreed slice.
