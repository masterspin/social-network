import { describe, expect, it } from "vitest";
import * as schema from "./schema";

describe("database schema", () => {
  it("exports Auth.js and application tables", () => {
    expect(schema.users).toBeDefined();
    expect(schema.accounts).toBeDefined();
    expect(schema.sessions).toBeDefined();
    expect(schema.profiles).toBeDefined();
    expect(schema.connections).toBeDefined();
  });
});
