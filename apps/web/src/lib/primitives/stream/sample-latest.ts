import { Array, Duration, Option, Stream } from "effect";

export const sampleLatest = (window: Duration.Input) => {
  return <A, E, R>(stream: Stream.Stream<A, E, R>) => {
    return stream.pipe(
      Stream.groupedWithin(10_000, window),
      Stream.map(Array.last),
      Stream.filter(Option.isSome),
      Stream.map((option) => option.value),
    );
  };
};
