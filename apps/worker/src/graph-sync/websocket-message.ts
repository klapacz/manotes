import { Predicate } from "effect";

const textEncoder = new TextEncoder();

export function webSocketMessageToUint8Array(
  message: string | ArrayBuffer,
): Uint8Array<ArrayBuffer> {
  if (Predicate.isString(message)) return textEncoder.encode(message);

  return new Uint8Array(message);
}
