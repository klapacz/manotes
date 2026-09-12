import { describe, expect, it } from "vite-plus/test";
import { AppUrlMatchPatterns, isAppUrl } from "./app-url";

describe("isAppUrl", () => {
  it.each([
    ["http://localhost:5173/notes", true],
    ["http://127.0.0.1:5173/notes", true],
    ["https://manotes.localhost/notes", true],
    ["https://01.manotes.localhost/notes", true],
    ["https://manotes.dev/notes", true],
    ["https://app.manotes.dev/notes", true],
    ["http://manotes.localhost/notes", false],
    ["https://other.localhost/notes", false],
    ["https://manotes.localhost.example.com/notes", false],
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
