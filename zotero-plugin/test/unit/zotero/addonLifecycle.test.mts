import assert from "node:assert/strict";
import test from "node:test";
import { AddonLifecycle } from "../../../src/bootstrap/addonLifecycle.ts";

test("startup waits for Zotero readiness and runs once", async () => {
  let resolveInitialization!: () => void;
  const initialization = new Promise<void>((resolve) => {
    resolveInitialization = resolve;
  });
  const lifecycle = new AddonLifecycle({
    initialization,
    unlocked: Promise.resolve(),
    uiReady: Promise.resolve(),
  });

  const starting = lifecycle.start();
  assert.equal(lifecycle.state, "starting");
  resolveInitialization();
  await starting;
  await lifecycle.start();

  assert.equal(lifecycle.state, "started");
});

test("shutdown disposes registrations in reverse order and is repeatable", async () => {
  const disposed: string[] = [];
  const lifecycle = new AddonLifecycle({
    initialization: Promise.resolve(),
    unlocked: Promise.resolve(),
    uiReady: Promise.resolve(),
  });
  await lifecycle.start();
  lifecycle.registerDisposer(() => disposed.push("first"));
  lifecycle.registerDisposer(async () => {
    disposed.push("second");
  });

  await lifecycle.shutdown();
  await lifecycle.shutdown();

  assert.deepEqual(disposed, ["second", "first"]);
  assert.equal(lifecycle.state, "stopped");
});
