import assert from "node:assert/strict";
import { test } from "node:test";
const mod = await import(new URL(`file://${process.env.WORKSPACE}/src/lines.mjs`).href);
test("exports jsonlLines", () => assert.equal(typeof mod.jsonlLines, "function"));
