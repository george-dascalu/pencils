import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import {
  defaultDependencyStyle,
  dependencyStyle,
} from "../public/dependency-style.js";

test("board dependency styles persist, stay isolated, undo and preserve legacy project appearance", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pencils-dependency-style-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  await store.init();
  const project = await store.createProject({ title: "Style lab" });
  const first = (await store.snapshot(project.id)).boards[0];
  const second = await store.createBoard(project.id, { title: "Second board" });
  const custom = {
    color: "#1266aa",
    width: 5,
    lineStyle: "dotted",
    toEnd: "arrow",
  };
  const legacy = {
    dependency_style: { ...defaultDependencyStyle, color: "#ff0000" },
  };
  assert.equal(dependencyStyle(first, legacy).color, "#ff0000");
  const updated = await store.updateBoard(project.id, first.id, {
    revision: first.revision,
    settings: { ...first.settings, dependency_style: custom },
    operationId: "style-change",
  });
  const fresh = new Store(root);
  await fresh.init();
  const boards = (await fresh.snapshot(project.id)).boards;
  assert.deepEqual(
    boards.find((b) => b.id === first.id).settings.dependency_style,
    custom,
  );
  assert.equal(
    dependencyStyle(
      boards.find((b) => b.id === second.id),
      legacy,
    ).color,
    "#ff0000",
  );
  for (const dependency_style of [
    null,
    {},
    { ...custom, color: "red" },
    { ...custom, width: 0 },
    { ...custom, lineStyle: "unknown" },
    { ...custom, toEnd: "none" },
  ]) {
    await assert.rejects(
      store.updateBoard(project.id, first.id, {
        revision: updated.revision,
        settings: { dependency_style },
      }),
      (error) => error.status === 400,
    );
  }
  const undone = await store.undoBoard(project.id, first.id, {
    operation: updated.operations.at(-1).id,
  });
  assert.equal(dependencyStyle(undone, legacy).color, "#ff0000");
  assert.deepEqual(dependencyStyle({}), {
    ...defaultDependencyStyle,
    fromEnd: "none",
  });
});
