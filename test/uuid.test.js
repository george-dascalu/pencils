import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "../public/uuid.js";

test("UUID generation uses the native API with its receiver when available", () => {
  const source = {
    randomUUID() {
      assert.equal(this, source);
      return "native-uuid";
    },
    getRandomValues() {
      throw Error("Native path should not request bytes");
    },
  };
  assert.equal(randomUUID(source), "native-uuid");
});

test("HTTP fallback keeps UUID v4 version, variant, padding and random bits", () => {
  for (const [fill, expected] of [
    [0, "00000000-0000-4000-8000-000000000000"],
    [255, "ffffffff-ffff-4fff-bfff-ffffffffffff"],
  ]) {
    const source = {
      getRandomValues(bytes) {
        assert.equal(this, source);
        assert.equal(bytes.length, 16);
        return bytes.fill(fill);
      },
    };
    assert.equal(randomUUID(source), expected);
  }
});

test("HTTP fallback generates distinct IDs in a burst without clocks or Math.random", (t) => {
  t.mock.method(Date, "now", () => 0);
  t.mock.method(Math, "random", () => {
    throw Error("Do not use weak randomness");
  });
  const source = { getRandomValues: (bytes) => crypto.getRandomValues(bytes) };
  const ids = Array.from({ length: 10000 }, () => randomUUID(source));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(
    ids.every((id) =>
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(
        id,
      ),
    ),
  );
});
