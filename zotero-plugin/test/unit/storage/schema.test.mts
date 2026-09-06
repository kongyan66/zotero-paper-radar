import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeFloat32Vector,
  encodeFloat32Vector,
  parseJsonArray,
  parseJsonObject,
} from "../../../src/infrastructure/storage/schema.ts";

test("stores vectors as finite little-endian Float32 blobs", () => {
  const encoded = encodeFloat32Vector([0.25, -1.5, 3]);

  assert.ok(encoded instanceof Uint8Array);
  assert.equal(encoded.byteLength, 12);
  assert.deepEqual(decodeFloat32Vector(encoded), [0.25, -1.5, 3]);
  assert.throws(() => encodeFloat32Vector([Number.NaN]), /finite/i);
  assert.throws(() => decodeFloat32Vector(new Uint8Array(3)), /multiple/i);
});

test("rejects malformed or non-object JSON fields", () => {
  assert.deepEqual(parseJsonObject('{"weight":1}', "weights"), {
    weight: 1,
  });
  assert.deepEqual(parseJsonArray('["cs.CV","cs.CL"]', "categories"), [
    "cs.CV",
    "cs.CL",
  ]);
  assert.throws(() => parseJsonObject("[]", "weights"), /object/i);
  assert.throws(() => parseJsonArray("{}", "categories"), /array/i);
  assert.throws(() => parseJsonObject("not-json", "weights"), /weights/i);
});
