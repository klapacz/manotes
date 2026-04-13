export const AppUrlPatternInputs: ReadonlyArray<URLPatternInit> = [
  { protocol: "http", hostname: "localhost", pathname: "/*" },
  { protocol: "http", hostname: "127.0.0.1", pathname: "/*" },
  { protocol: "https", hostname: "manotes.dev", pathname: "/*" },
  { protocol: "https", hostname: "*.manotes.dev", pathname: "/*" },
];

const appUrlPatterns = AppUrlPatternInputs.map((pattern) => new URLPattern(pattern));

export function isAppUrl(rawUrl: string): boolean {
  return appUrlPatterns.some((pattern) => pattern.test(rawUrl));
}

export const AppUrlMatchPatterns = AppUrlPatternInputs.map(toMatchPattern);

function toMatchPattern(pattern: URLPatternInit): string {
  return `${pattern.protocol ?? "*"}://${pattern.hostname ?? "*"}${pattern.pathname ?? "/*"}`;
}
