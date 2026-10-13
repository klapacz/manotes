import { Record, Stream } from "effect";

export function zipLatestRecord<
  const Streams extends Readonly<Record<string, Stream.Stream<unknown, unknown, unknown>>>,
>(
  streams: Streams,
): Stream.Stream<
  { [K in keyof Streams]: Stream.Success<Streams[K]> },
  { [K in keyof Streams]: Stream.Error<Streams[K]> }[keyof Streams],
  { [K in keyof Streams]: Stream.Services<Streams[K]> }[keyof Streams]
> {
  // Keep empty and populated records behind the same lazy adapter and type boundary.
  // SAFETY: Each output key carries only its input stream's values; errors and services pass through unchanged.
  return Stream.suspend(() => {
    const entries = Record.collect(streams, (key, stream) =>
      stream.pipe(Stream.map((value) => [key, value] as const)),
    );

    if (entries.length === 0) {
      return Stream.succeed({});
    }

    return Stream.zipLatestAll(...entries).pipe(Stream.map(Record.fromEntries));
  }) as Stream.Stream<
    { [K in keyof Streams]: Stream.Success<Streams[K]> },
    { [K in keyof Streams]: Stream.Error<Streams[K]> }[keyof Streams],
    { [K in keyof Streams]: Stream.Services<Streams[K]> }[keyof Streams]
  >;
}

export * as EffectStream from "./stream";
