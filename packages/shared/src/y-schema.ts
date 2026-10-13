import {
  Brand,
  Data,
  Effect,
  Function,
  Option,
  Pipeable,
  Predicate,
  Schema,
  SchemaAST,
  Types,
} from "effect";
import * as Y from "yjs";

const TypeId = Symbol("YSchema.Cursor");

const SchemaTypeId = Symbol("YSchema.Schema");

const MapTypeId = Symbol("YSchema.Map");

const KeyNameId = Symbol("YSchema.KeyName");

const MapAnnotation = "manotes/YSchema/Map";

const KeyNameAnnotation = "manotes/YSchema/KeyName";

type ObjectSchema = Schema.ConstraintCodec<object, object, never, never>;

// Effect 4.0.0-rc.112, src/Schema.ts optionalKey: preserve schema views and key modifiers,
// with a map marker and storage annotation added for Yjs.
export interface Map<S extends ObjectSchema, Name extends string = never> extends Schema.BottomLazy<
  S["ast"],
  Map<S, Name>,
  S["~type.parameters"],
  S["~type.mutability"],
  S["~type.optionality"],
  S["~type.constructor.default"],
  S["~encoded.mutability"],
  S["~encoded.optionality"]
> {
  readonly Type: S["Type"];
  readonly Encoded: S["Encoded"];
  readonly DecodingServices: S["DecodingServices"];
  readonly EncodingServices: S["EncodingServices"];
  readonly "~type.make.in": S["~type.make.in"];
  readonly "~type.make": S["~type.make"];
  readonly Iso: S["Iso"];
  readonly [MapTypeId]: S;
  readonly [KeyNameId]: Name;
}

// The annotation changes storage, while decoding and encoding still describe plain JSON.
export function Map<S extends ObjectSchema>(schema: S): Map<S>;
export function Map<
  S extends ObjectSchema & { readonly key: Schema.Constraint; readonly value: Schema.Constraint },
  const Name extends string,
>(opts: { readonly schema: S; readonly key: Name }): Map<S, Name>;
export function Map(input: ObjectSchema | { readonly schema: ObjectSchema; readonly key: string }) {
  const schema = "schema" in input ? input.schema : input;

  const key =
    "schema" in input ? Schema.decodeUnknownSync(Schema.NonEmptyString)(input.key) : undefined;

  objectMembers(schema.ast);

  return Schema.make<Map<ObjectSchema, string>>(schema.ast, {
    [MapTypeId]: schema,
    [KeyNameId]: key,
  }).annotate({ [MapAnnotation]: true, [KeyNameAnnotation]: key });
}

// Named dictionary keys are an API argument; they do not change stored JSON keys.
type KeyName<S> = S extends { readonly [KeyNameId]: infer Name extends string }
  ? [Name] extends [never]
    ? string
    : Name
  : string;

type KeyInput<S> = S extends { readonly [KeyNameId]: infer Name extends string }
  ? [Name] extends [never]
    ? string
    : { readonly [P in Name]: string }
  : string;

type KeyArg<S, K extends string> =
  | (K & Extract<KeyInput<S>, string>)
  | ({ readonly [P in KeyName<S>]: K } & Exclude<KeyInput<S>, string>);

type Members<S> = S extends { readonly [MapTypeId]: infer Inner }
  ? Members<Inner>
  : S extends { readonly members: readonly (infer M)[] }
    ? Members<M>
    : S extends { readonly cases: infer C }
      ? Members<C[keyof C]>
      : S extends { readonly schema: infer Inner }
        ? Members<Inner>
        : S extends { readonly to: infer Inner }
          ? Members<Inner>
          : S;

type NarrowSchema<S, K extends string, V> =
  S extends Map<infer Inner, infer Name>
    ? NarrowSchema<Inner, K, V> extends infer N extends ObjectSchema
      ? Map<N, Name>
      : never
    : Members<S> extends infer M
      ? M extends Schema.Constraint
        ? V extends Field<M["Type"], K>
          ? M
          : never
        : never
      : never;

type PropertySchema<S, K extends string> =
  Members<S> extends infer M
    ? M extends { readonly fields: infer F }
      ? K extends keyof F
        ? F[K]
        : never
      : M extends { readonly key: Schema.Constraint; readonly value: infer V }
        ? V
        : never
    : never;

type Unwrap<S> = S extends { readonly [MapTypeId]: ObjectSchema }
  ? S
  : S extends { readonly schema: infer Inner }
    ? Unwrap<Inner>
    : S extends { readonly to: infer Inner }
      ? Unwrap<Inner>
      : S;

// A dictionary entry can hold atomic values alongside a schema-declared map variant.
type MapVariant<S> =
  Unwrap<S> extends infer Value
    ? Value extends ObjectSchema & { readonly [MapTypeId]: ObjectSchema }
      ? Value
      : Value extends { readonly members: readonly (infer Member)[] }
        ? MapVariant<Member>
        : never
    : never;

type MapKeys<A, S> = {
  [K in Keys<A>]: [MapSchema<S, K>] extends [never] ? never : K;
}[Keys<A>];

type MapSchema<S, K extends string> = MapVariant<PropertySchema<S, K>>;

type MapCursor<S, K extends string> = Cursor<MapSchema<S, K>["Type"], MapSchema<S, K>>;

type CursorSchema<C> = C extends Cursor<object, infer S> ? S : never;

// Flatten record variants, but keep atomic values intact. Shared maps are loose recursively.
export type Loose<S extends Schema.Constraint> = {
  readonly [K in Keys<S["Type"]>]?: LooseField<PropertySchema<S, K>>;
};

type LooseField<S> =
  Unwrap<S> extends Map<infer Inner, infer _Name>
    ? Loose<Inner>
    : S extends Schema.Constraint
      ? S["Type"]
      : never;

type Keys<A> = A extends unknown ? Extract<keyof A, string> : never;

type CommonKeys<A> = Extract<keyof A, string>;

type Field<A, K extends string> = A extends unknown
  ? K extends keyof A
    ? Exclude<A[K], undefined>
    : never
  : never;

type Narrow<A, K extends string, V> = A extends unknown
  ? K extends keyof A
    ? V extends Exclude<A[K], undefined>
      ? A
      : never
    : never
  : never;

type RequiredKeys<A> = A extends unknown ? Types.RequiredKeys<A> : never;

type UnbrandedKey<K> = K extends Brand.Brand<infer _Name> ? Brand.Brand.Unbranded<K> : K;

type OptionalKeys<A> =
  string extends UnbrandedKey<CommonKeys<A>> ? CommonKeys<A> : Exclude<Keys<A>, RequiredKeys<A>>;

type Expected<S, V> = S extends { readonly value: infer Current }
  ? V extends Current
    ? S & { readonly value: V }
    : never
  : never;

type State<A extends object> = {
  readonly map: Y.Map<unknown>;
  readonly schema: Schema.Codec<A, unknown>;
  readonly members: readonly SchemaAST.Objects[];
  readonly keyName: string | undefined;
  readonly guards: readonly {
    readonly map: Y.Map<unknown>;
    readonly key: string;
    readonly value: unknown;
  }[];
};

export interface Cursor<A extends object, S extends Schema.Constraint = Schema.Codec<A, unknown>>
  extends Pipeable.Pipeable {
  readonly [TypeId]: State<A>;
  readonly [SchemaTypeId]: Types.Covariant<S>;
}

// Distribute over the value so checking .value narrows the entire selection.
export type Selection<
  A extends object,
  K extends string,
  V = Field<A, K>,
  S extends Schema.Constraint = Schema.Codec<A, unknown>,
> = V extends unknown
  ? Cursor<Narrow<A, K, V>, NarrowSchema<S, K, V>> & {
      readonly value: V;
      readonly focus: Cursor<Narrow<A, K, V>, NarrowSchema<S, K, V>>;
    }
  : never;

export class YSchemaError extends Data.TaggedError("YSchemaError")<{
  readonly operation: string;
  readonly key: string;
  readonly cause: unknown;
}> {}

export const make = <S extends Schema.ConstraintCodec<object, unknown, never, never>>(opts: {
  readonly schema: S;
  readonly map: Y.Map<unknown>;
}): Cursor<S["Type"], S> => {
  return cursor<S["Type"], S>({
    map: opts.map,
    schema: Schema.make<Schema.Codec<S["Type"], unknown>>(opts.schema.ast),
    members: objectMembers(opts.schema.ast),
    guards: [],
    keyName: keyNameOf(opts.schema.ast),
  });
};

export const find: {
  <A extends object, S extends Schema.Constraint, const K extends Keys<A>>(
    argument: KeyArg<S, K>,
  ): (
    bound: Cursor<A, S>,
  ) => Effect.Effect<Option.Option<Selection<A, K, Field<A, K>, S>>, YSchemaError>;
  <A extends object, S extends Schema.Constraint, const K extends Keys<A>>(
    bound: Cursor<A, S>,
    argument: KeyArg<S, K>,
  ): Effect.Effect<Option.Option<Selection<A, K, Field<A, K>, S>>, YSchemaError>;
} = Function.dual(
  2,
  Effect.fn("YSchema.find")(function* <
    A extends object,
    S extends Schema.Constraint,
    K extends Keys<A>,
  >(bound: Cursor<A, S>, argument: KeyArg<S, K>) {
    const { schema, stored, key } = yield* Effect.try({
      try: () => {
        const key = resolveKey(bound, argument);

        return { ...readField(bound, key), key };
      },
      catch: (cause) => {
        return new YSchemaError({ operation: "find", key: keyLabel(bound, argument), cause });
      },
    });

    if (Option.isNone(stored)) return Option.none();

    const value = yield* Schema.decodeUnknownEffect(schema)(stored.value).pipe(
      Effect.mapError((cause) => new YSchemaError({ operation: "find", key, cause })),
    );

    return Option.some(select(bound, key, value));
  }),
);

export const upsert: {
  <
    A extends object,
    S extends Schema.Constraint,
    const K extends CommonKeys<A>,
    const V extends Field<A, K>,
  >(
    argument: KeyArg<S, K>,
    value: V,
  ): (bound: Cursor<A, S>) => Effect.Effect<Selection<A, K, Field<A, K>, S>, YSchemaError>;
  <
    A extends object,
    S extends Schema.Constraint,
    const K extends CommonKeys<A>,
    const V extends Field<A, K>,
  >(
    bound: Cursor<A, S>,
    argument: KeyArg<S, K>,
    value: V,
  ): Effect.Effect<Selection<A, K, Field<A, K>, S>, YSchemaError>;
} = Function.dual(
  3,
  Effect.fn("YSchema.upsert")(
    <A extends object, S extends Schema.Constraint, K extends CommonKeys<A>, V extends Field<A, K>>(
      bound: Cursor<A, S>,
      argument: KeyArg<S, K>,
      value: V,
    ) => {
      return transact(bound, "upsert", argument, (key) => {
        const existing = readSync(bound, key);

        if (Option.isSome(existing)) return existing.value;

        return writeSync<A, K, Field<A, K>, S>(bound, key, value);
      });
    },
  ),
);

export const set: {
  <
    A extends object,
    S extends Schema.Constraint,
    const K extends CommonKeys<A>,
    const V extends Field<A, K>,
  >(
    argument: KeyArg<S, K>,
    value: V,
  ): (bound: Cursor<A, S>) => Effect.Effect<Selection<A, K, V, S>, YSchemaError>;
  <
    A extends object,
    S extends Schema.Constraint,
    const K extends CommonKeys<A>,
    const V extends Field<A, K>,
  >(
    bound: Cursor<A, S>,
    argument: KeyArg<S, K>,
    value: V,
  ): Effect.Effect<Selection<A, K, V, S>, YSchemaError>;
} = Function.dual(
  3,
  Effect.fn("YSchema.set")(
    <A extends object, S extends Schema.Constraint, K extends CommonKeys<A>, V>(
      bound: Cursor<A, S>,
      argument: KeyArg<S, K>,
      value: V,
    ) => transact(bound, "set", argument, (key) => writeSync(bound, key, value)),
  ),
);

export const clear: {
  <A extends object, S extends Schema.Constraint, const K extends OptionalKeys<A> & CommonKeys<A>>(
    argument: KeyArg<S, K>,
  ): (bound: Cursor<A, S>) => Effect.Effect<Cursor<A, S>, YSchemaError>;
  <A extends object, S extends Schema.Constraint, const K extends OptionalKeys<A> & CommonKeys<A>>(
    bound: Cursor<A, S>,
    argument: KeyArg<S, K>,
  ): Effect.Effect<Cursor<A, S>, YSchemaError>;
} = Function.dual(
  2,
  Effect.fn("YSchema.clear")(
    <A extends object, S extends Schema.Constraint, K extends string>(
      bound: Cursor<A, S>,
      argument: KeyArg<S, K>,
    ) => {
      return transact(bound, "clear", argument, (key) => {
        assertContext(bound);
        fieldAsts(bound, key);

        if (
          bound[TypeId].members.some((member) => {
            return member.propertySignatures.some(
              (field) => field.name === key && !field.type.context?.isOptional,
            );
          })
        ) {
          throw new globalThis.Error(`Cannot clear required field ${key}`);
        }

        bound[TypeId].map.delete(key);

        return bound;
      });
    },
  ),
);

export const findMap: {
  <A extends object, S extends Schema.Constraint, const K extends MapKeys<A, S>>(
    argument: KeyArg<S, K>,
  ): (bound: Cursor<A, S>) => Effect.Effect<Option.Option<MapCursor<S, K>>, YSchemaError>;
  <A extends object, S extends Schema.Constraint, const K extends MapKeys<A, S>>(
    bound: Cursor<A, S>,
    argument: KeyArg<S, K>,
  ): Effect.Effect<Option.Option<MapCursor<S, K>>, YSchemaError>;
} = Function.dual(
  2,
  Effect.fn("YSchema.findMap")(
    <A extends object, S extends Schema.Constraint, K extends MapKeys<A, S>>(
      bound: Cursor<A, S>,
      argument: KeyArg<S, K>,
    ) => {
      return Effect.try({
        try: () => readMap(bound, resolveKey(bound, argument)),
        catch: (cause) => {
          return new YSchemaError({ operation: "findMap", key: keyLabel(bound, argument), cause });
        },
      });
    },
  ),
);

export const upsertMap: {
  <A extends object, S extends Schema.Constraint, const K extends MapKeys<A, S> & CommonKeys<A>>(
    argument: KeyArg<S, K>,
  ): (bound: Cursor<A, S>) => Effect.Effect<MapCursor<S, K>, YSchemaError>;
  <A extends object, S extends Schema.Constraint, const K extends MapKeys<A, S> & CommonKeys<A>>(
    bound: Cursor<A, S>,
    argument: KeyArg<S, K>,
  ): Effect.Effect<MapCursor<S, K>, YSchemaError>;
} = Function.dual(
  2,
  Effect.fn("YSchema.upsertMap")(
    <A extends object, S extends Schema.Constraint, K extends MapKeys<A, S> & CommonKeys<A>>(
      bound: Cursor<A, S>,
      argument: KeyArg<S, K>,
    ) => {
      return transact(bound, "upsertMap", argument, (key) => {
        const existing = readMap(bound, key);

        if (Option.isSome(existing)) return existing.value;

        assertVariant(bound, key);
        const child = new Y.Map<unknown>();
        const focus = bindMap(bound, key, child);
        bound[TypeId].map.set(key, child);

        return focus;
      });
    },
  ),
);

// A detached raw snapshot, deliberately separate from validation for DB materialization.
export const toJSON = Effect.fn("YSchema.toJSON")(<A extends object, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
): Effect.Effect<object, YSchemaError> => {
  return Effect.try({
    try: () => {
      assertContext(bound);

      return structuredClone(bound[TypeId].map.toJSON());
    },
    catch: (cause) => new YSchemaError({ operation: "toJSON", key: "", cause }),
  });
});

// Invalid fields are omitted; valid fields from any record variant survive.
export const exportLoose = Effect.fn("YSchema.exportLoose")(function* <
  C extends Cursor<object, Schema.Constraint>,
>(bound: C): Effect.fn.Return<Loose<CursorSchema<C>>, YSchemaError> {
  const snapshot = yield* toJSON(bound);

  // SAFETY: looseAst mirrors Loose<S>, flattening fields and recursing only into shared maps.
  const schema = Schema.make<Schema.Codec<Loose<CursorSchema<C>>, unknown>>(
    looseAst(bound[TypeId].schema.ast),
  );

  return yield* Schema.decodeUnknownEffect(schema)(snapshot).pipe(
    Effect.mapError((cause) => new YSchemaError({ operation: "exportLoose", key: "", cause })),
  );
});

// Decode the complete schema, including required fields, defaults, transforms and checks.
export const exportStrict = Effect.fn("YSchema.exportStrict")(function* <
  C extends Cursor<object, Schema.Constraint>,
>(bound: C): Effect.fn.Return<C[typeof TypeId]["schema"]["Type"], YSchemaError> {
  const snapshot = yield* toJSON(bound);

  // SAFETY: the cursor stores the schema for its own model, including a union of selections.
  const schema = Schema.make<Schema.Codec<C[typeof TypeId]["schema"]["Type"], unknown>>(
    bound[TypeId].schema.ast,
  );

  return yield* Schema.decodeUnknownEffect(schema)(snapshot).pipe(
    Effect.mapError((cause) => new YSchemaError({ operation: "exportStrict", key: "", cause })),
  );
});

export const expect: {
  <S extends Cursor<object> & { readonly value: unknown }, const V extends S["value"]>(
    value: V,
  ): (selection: S) => Effect.Effect<Expected<S, V>, YSchemaError>;
  <S extends Cursor<object> & { readonly value: unknown }, const V extends S["value"]>(
    selection: S,
    value: V,
  ): Effect.Effect<Expected<S, V>, YSchemaError>;
} = Function.dual(
  2,
  Effect.fn("YSchema.expect")(function* <
    S extends Cursor<object> & { readonly value: unknown },
    V extends S["value"],
  >(selection: S, value: V): Effect.fn.Return<Expected<S, V>, YSchemaError> {
    if (!Object.is(selection.value, value)) {
      return yield* Effect.fail(
        new YSchemaError({
          operation: "expect",
          key: "value",
          cause: new globalThis.Error(
            `Expected ${String(value)}, received ${String(selection.value)}`,
          ),
        }),
      );
    }

    // SAFETY: Object.is checked the discriminating value of this correlated selection union.
    return selection as Expected<S, V>;
  }),
);

class Bound<A extends object, S extends Schema.Constraint>
  extends Pipeable.Class
  implements Cursor<A, S>
{
  declare readonly [SchemaTypeId]: Types.Covariant<S>;
  readonly [TypeId]: State<A>;

  constructor(state: State<A>) {
    super();
    this[TypeId] = state;
  }
}

function cursor<A extends object, S extends Schema.Constraint = Schema.Codec<A, unknown>>(
  state: State<A>,
): Cursor<A, S> {
  return new Bound<A, S>(state);
}

// Inspired by effect-qb 0.24.1, internal/runtime/schema.ts propertyAstOf:
// retain field ASTs and checks across unions; additionally retain branch context.
function objectMembers(ast: SchemaAST.AST): readonly SchemaAST.Objects[] {
  if (SchemaAST.isObjects(ast)) return [ast];

  if (SchemaAST.isUnion(ast)) return ast.types.flatMap(objectMembers);

  if (SchemaAST.isSuspend(ast)) return objectMembers(ast.thunk());

  throw new globalThis.Error("YSchema requires an object schema or union of object schemas");
}

function unionAst(asts: readonly SchemaAST.AST[]): SchemaAST.AST {
  const first = asts[0];

  if (first === undefined) throw new globalThis.Error("No matching schema variant");

  if (asts.length === 1) return first;

  return new SchemaAST.Union(asts, { mode: "anyOf" });
}

function narrowAst(ast: SchemaAST.AST, members: readonly SchemaAST.Objects[]): SchemaAST.AST {
  if (SchemaAST.isSuspend(ast)) return narrowAst(ast.thunk(), members);

  if (!SchemaAST.isUnion(ast)) return ast;

  const branches = ast.types
    .filter((branch) => objectMembers(branch).some((member) => members.includes(member)))
    .map((branch) => narrowAst(branch, members));

  return new SchemaAST.Union(
    branches,
    ast.options,
    ast.annotations,
    ast.checks,
    ast.encoding,
    ast.context,
    ast.encodingChecks,
  );
}

function looseAst(ast: SchemaAST.AST): SchemaAST.Objects {
  const members = objectMembers(ast);
  const fields = new globalThis.Map<PropertyKey, SchemaAST.AST[]>();

  for (const member of members) {
    for (const field of member.propertySignatures) {
      fields.set(field.name, [...(fields.get(field.name) ?? []), field.type]);
    }
  }

  return new SchemaAST.Objects(
    [...fields].map(([name, variants]) => {
      return new SchemaAST.PropertySignature(name, Schema.optionalKey(looseField(variants)).ast);
    }),
    members.flatMap((member) => {
      return member.indexSignatures.map(
        (field) => new SchemaAST.IndexSignature(field.parameter, looseField([field.type]).ast),
      );
    }),
  );
}

function looseField(variants: readonly SchemaAST.AST[]) {
  const ast = unionAst(
    variants.map((field) => {
      return field.annotations?.[MapAnnotation] === true ? looseAst(field) : field;
    }),
  );

  return Schema.make<Schema.Codec<unknown>>(ast).pipe(
    Schema.catchDecoding(() => Effect.succeed(Option.none())),
  );
}

function propertyAst(member: SchemaAST.Objects, key: string): SchemaAST.AST | undefined {
  const property = member.propertySignatures.find((field) => field.name === key);

  if (property !== undefined) return property.type;

  return member.indexSignatures.find((field) => {
    return Schema.is(Schema.make<Schema.Codec<unknown>>(field.parameter))(key);
  })?.type;
}

function fieldAsts<A extends object, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
  key: string,
): SchemaAST.AST[] {
  const fields = bound[TypeId].members.flatMap((member) => {
    const field = propertyAst(member, key);

    return field === undefined ? [] : [field];
  });

  if (fields.length === 0) throw new globalThis.Error(`Unknown field ${key}`);

  return fields;
}

function fieldSchema<A extends object, K extends string, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
  key: K,
) {
  // SAFETY: these field ASTs come from the schema describing A, including its optional fields.
  return Schema.make<Schema.Codec<Field<A, K>, unknown>>(unionAst(fieldAsts(bound, key)));
}

function assertContext<A extends object, S extends Schema.Constraint>(bound: Cursor<A, S>): void {
  const { map, guards } = bound[TypeId];

  if (map.doc === null) throw new globalThis.Error("YSchema requires an attached Y.Map");

  for (const guard of guards) {
    if (!Object.is(guard.map.get(guard.key), guard.value)) {
      throw new globalThis.Error(
        `Selection no longer matches ${guard.key}: ${String(guard.value)}`,
      );
    }
  }
}

function assertVariant<A extends object, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
  skip: string,
): void {
  const { map, members } = bound[TypeId];

  for (const property of members[0]?.propertySignatures ?? []) {
    const key = property.name;

    if (key === skip || !Predicate.isString(key)) continue;

    if (!SchemaAST.isLiteral(property.type)) continue;

    if (property.type.context?.isOptional) continue;

    const expected = property.type.literal;

    const shared = members.every((member) => {
      const field = propertyAst(member, key);

      return (
        field !== undefined && SchemaAST.isLiteral(field) && Object.is(field.literal, expected)
      );
    });

    if (!shared) continue;

    const stored = Schema.encodeUnknownSync(Schema.make<Schema.Codec<unknown>>(property.type))(
      expected,
    );

    if (!Object.is(map.get(key), stored)) {
      throw new globalThis.Error(`Selection no longer matches ${key}: ${String(expected)}`);
    }
  }
}

function readField<A extends object, K extends string, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
  key: K,
) {
  assertContext(bound);
  const schema = fieldSchema(bound, key);
  const map = bound[TypeId].map;
  const stored = map.has(key) ? Option.some(map.get(key)) : Option.none();

  return {
    schema,
    stored: Option.map(stored, (value) => {
      return value instanceof Y.AbstractType ? value.toJSON() : value;
    }),
  };
}

function readSync<A extends object, K extends string, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
  key: K,
): Option.Option<Selection<A, K, Field<A, K>, S>> {
  const { schema, stored } = readField(bound, key);

  if (Option.isNone(stored)) return Option.none();

  const value = Schema.decodeUnknownSync(schema)(stored.value);

  return Option.some(select(bound, key, value));
}

function select<A extends object, K extends string, V, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
  key: K,
  value: V,
): Selection<A, K, V, S> {
  const members = bound[TypeId].members.filter((member) => {
    const field = propertyAst(member, key);

    return (
      field !== undefined &&
      Schema.is(Schema.toType(Schema.make<Schema.Codec<unknown>>(field)))(value)
    );
  });

  const focus = cursor<Narrow<A, K, V>, NarrowSchema<S, K, V>>({
    map: bound[TypeId].map,
    // SAFETY: retain whole-schema checks while restricting branches to the selected value.
    schema: Schema.make<Schema.Codec<Narrow<A, K, V>, unknown>>(
      narrowAst(bound[TypeId].schema.ast, members),
    ),
    members,
    keyName: bound[TypeId].keyName,
    guards: fieldAsts(bound, key).every(SchemaAST.isLiteral)
      ? [
          ...bound[TypeId].guards,
          {
            map: bound[TypeId].map,
            key,
            value: Schema.encodeUnknownSync(fieldSchema(bound, key))(value),
          },
        ]
      : bound[TypeId].guards,
  });

  // SAFETY: Schema.is selected matching branches, establishing the value/focus correlation.
  return Object.assign(focus, { value, focus }) as Selection<A, K, V, S>;
}

function writeSync<A extends object, K extends string, V, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
  key: K,
  value: V,
): Selection<A, K, V, S> {
  assertContext(bound);
  const encoded = Schema.encodeUnknownSync(fieldSchema(bound, key))(value);
  const selection = select(bound, key, value);

  if (!fieldAsts(bound, key).every(SchemaAST.isLiteral)) assertVariant(selection.focus, key);
  // One field is atomic JSON; bind nested shared maps separately when editing their entries.
  bound[TypeId].map.set(key, mountField(fieldAsts(bound, key), encoded));

  return selection;
}

function mapFieldAsts<A extends object, S extends Schema.Constraint>(
  bound: Cursor<A, S>,
  key: string,
) {
  const variants = fieldAsts(bound, key).map(mapVariants);

  if (variants.some((fields) => fields.length === 0)) {
    throw new globalThis.Error(`Field ${key} is not declared with YSchema.Map`);
  }

  return variants.flat();
}

function mapVariants(ast: SchemaAST.AST): readonly SchemaAST.AST[] {
  if (ast.annotations?.[MapAnnotation] === true) return [ast];

  if (SchemaAST.isUnion(ast)) return ast.types.flatMap(mapVariants);

  if (SchemaAST.isSuspend(ast)) return mapVariants(ast.thunk());

  return [];
}

function bindMap<A extends object, S extends Schema.Constraint, K extends string>(
  bound: Cursor<A, S>,
  key: K,
  child: Y.Map<unknown>,
): MapCursor<S, K> {
  const fields = mapFieldAsts(bound, key);
  const keyName = keyNameOf(fields[0]);

  if (!fields.every((field) => keyNameOf(field) === keyName)) {
    throw new globalThis.Error(
      "Narrow the record kind before entering a map with different key names",
    );
  }

  return cursor<MapSchema<S, K>["Type"], MapSchema<S, K>>({
    map: child,
    schema: Schema.make<Schema.Codec<MapSchema<S, K>["Type"], unknown>>(unionAst(fields)),
    members: fields.flatMap(objectMembers),
    keyName,
    guards: [...bound[TypeId].guards, { map: bound[TypeId].map, key, value: child }],
  });
}

function readMap<A extends object, S extends Schema.Constraint, K extends string>(
  bound: Cursor<A, S>,
  key: K,
): Option.Option<MapCursor<S, K>> {
  assertContext(bound);
  mapFieldAsts(bound, key);
  const map = bound[TypeId].map;

  if (!map.has(key)) return Option.none();

  const child = map.get(key);

  if (!(child instanceof Y.Map)) throw new globalThis.Error(`Field ${key} must contain a Y.Map`);

  return Option.some(bindMap(bound, key, child));
}

function mountField<Encoded>(
  fields: readonly SchemaAST.AST[],
  encoded: Encoded,
): Encoded | Y.Map<unknown> {
  if (fields.every((field) => field.annotations?.[MapAnnotation] !== true)) {
    return structuredClone(encoded);
  }

  if (!fields.every((field) => field.annotations?.[MapAnnotation] === true)) {
    throw new globalThis.Error("Narrow the record kind before writing a field with mixed storage");
  }

  if (!Predicate.isObject(encoded)) throw new globalThis.Error("YSchema.Map must encode an object");

  const members = fields.flatMap(objectMembers).filter((member) => {
    return Schema.is(Schema.toEncoded(Schema.make<Schema.Codec<unknown>>(member)))(encoded);
  });

  const map = new Y.Map<unknown>();

  for (const [key, value] of Object.entries(encoded)) {
    const children = members.flatMap((member) => {
      const field = propertyAst(member, key);

      return field === undefined ? [] : [field];
    });

    if (children.length === 0) throw new globalThis.Error(`Unknown map entry ${key}`);

    map.set(key, mountField(children, value));
  }

  return map;
}

// Yjs transactions are synchronous; decoding and context checks must finish before their writes.
function transact<A extends object, B, S extends Schema.Constraint, K extends string>(
  bound: Cursor<A, S>,
  operation: "upsert" | "set" | "clear" | "upsertMap",
  argument: KeyArg<S, K>,
  body: (key: K) => B,
): Effect.Effect<B, YSchemaError> {
  return Effect.try({
    try: () => {
      const doc = bound[TypeId].map.doc;

      if (doc === null) throw new globalThis.Error("YSchema requires an attached Y.Map");

      const key = resolveKey(bound, argument);

      return doc.transact(() => body(key));
    },
    catch: (cause) => new YSchemaError({ operation, key: keyLabel(bound, argument), cause }),
  });
}

function keyNameOf(ast: SchemaAST.AST | undefined): string | undefined {
  const name = ast?.annotations?.[KeyNameAnnotation];

  return name === undefined ? undefined : Schema.decodeUnknownSync(Schema.NonEmptyString)(name);
}

function keyLabel<A extends object, S extends Schema.Constraint, K extends string>(
  bound: Cursor<A, S>,
  argument: KeyArg<S, K>,
): string {
  return Predicate.isString(argument) ? argument : (bound[TypeId].keyName ?? "");
}

function resolveKey<A extends object, S extends Schema.Constraint, K extends string>(
  bound: Cursor<A, S>,
  argument: KeyArg<S, K>,
): K {
  const name = bound[TypeId].keyName;

  if (name === undefined) {
    if (!Predicate.isString(argument)) throw new globalThis.Error("Expected a field name");

    // SAFETY: an unnamed schema takes its string key directly; field lookup validates it.
    return argument as K;
  }

  if (
    !Predicate.isObject(argument) ||
    Object.keys(argument).length !== 1 ||
    !Object.hasOwn(argument, name)
  ) {
    throw new globalThis.Error(`Expected a single named key: ${name}`);
  }

  const key = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(argument)[name];

  if (!Predicate.isString(key)) throw new globalThis.Error(`Expected ${name} to be a string`);

  // SAFETY: KeyArg binds this named entry to K; field lookup validates its schema.
  return key as K;
}

export * as YSchema from "./y-schema";
