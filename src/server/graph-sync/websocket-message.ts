export function webSocketMessageToUint8Array(
  message: string | ArrayBuffer,
): Uint8Array {
  if (typeof message === "string") return new TextEncoder().encode(message);
  return new Uint8Array(message);
}
