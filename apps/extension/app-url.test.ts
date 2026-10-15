import { describe, expect, it } from "vite-plus/test";
import { AppUrlMatchPatterns, isAppUrl } from "./app-url";

describe("isAppUrl", () => {
  it.each([
    ["http://localhost:5173/records", true],
    ["http://127.0.0.1:5173/records", true],
    ["https://manotes.localhost/records", true],
    ["https://01.manotes.localhost/records", true],
    ["https://manotes.dev/records", true],
    ["https://app.manotes.dev/records", true],
    ["http://manotes.localhost/records", false],
    ["https://other.localhost/records", false],
    ["https://manotes.localhost.example.com/records", false],
  ] as const)("classifies %s as %s", (url, expected) => {
    expect(isAppUrl(url)).toBe(expected);
  });
});

describe("AppUrlMatchPatterns", () => {
  it("includes only the supported local and production hosts", () => {
    expect(AppUrlMatchPatterns).toEqual([
      "http://localhost/*",
      "http://127.0.0.1/*",
      "https://manotes.localhost/*",
      "https://*.manotes.localhost/*",
      "https://manotes.dev/*",
      "https://*.manotes.dev/*",
    ]);
  });
});
