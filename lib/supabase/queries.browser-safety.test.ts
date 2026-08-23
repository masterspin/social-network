import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("browser query safety", () => {
  it("guards server database imports from browser-callable query functions", () => {
    const source = readFileSync("lib/supabase/queries.ts", "utf8");
    const functions = source
      .split(/\nexport async function /)
      .slice(1)
      .map((chunk) => `export async function ${chunk}`);

    const unsafeFunctions = functions.flatMap((chunk) => {
      const name = chunk.match(/export async function\s+(\w+)/)?.[1];
      const serverDepsIndex = chunk.indexOf("getServerDeps");

      if (!name || serverDepsIndex === -1) return [];

      const beforeServerDeps = chunk.slice(0, serverDepsIndex);
      const hasBrowserGuard = beforeServerDeps.includes(
        'typeof window !== "undefined"',
      );

      return hasBrowserGuard ? [] : [name];
    });

    expect(unsafeFunctions).toEqual([]);
  });
});
