import test from "node:test";
import assert from "node:assert/strict";
import { mappingKey, parseCsv, quoteCsv } from "../lib/mapping.mjs";

test("parseCsv keeps commas and quotes inside fields", () => {
  const rows = parseCsv('provider,notes\nbein,"a, b"\nsky,"say ""hi"""\n');
  assert.deepEqual(rows, [
    ["provider", "notes"],
    ["bein", "a, b"],
    ["sky", 'say "hi"'],
  ]);
});

test("parseCsv ignores blank lines and handles CRLF", () => {
  const rows = parseCsv("a,b\r\n1,2\r\n\r\n");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("quoteCsv only quotes when needed", () => {
  assert.equal(quoteCsv("bein"), "bein");
  assert.equal(quoteCsv("a,b"), '"a,b"');
  assert.equal(quoteCsv('say "hi"'), '"say ""hi"""');
});

test("mappingKey is case-insensitive across provider and source id", () => {
  assert.equal(mappingKey("bein_mena", "8AEA2426"), "bein_mena:8aea2426");
});
