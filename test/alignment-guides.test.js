import test from "node:test";
import assert from "node:assert/strict";
import {
  alignmentTargets,
  snapTranslation,
  snapResize,
} from "../public/alignment-guides.js";
const note = (id, x, y, w = 120, h = 100) => ({
  id,
  type: "sticky",
  x,
  y,
  w,
  h,
});
test("aligns edges and centres exactly, ahead of grid rounding", () => {
  const a = note("a", 13, 20),
    b = note("b", 307, 300);
  const r = snapTranslation([a], [b], 290, 100, { grid: true });
  assert.equal(a.x + r.dx, 307);
  assert.equal(a.y + r.dy, 120);
  assert.equal(r.guides[0].kind, "align");
  const center = snapTranslation([a], [note("b", 300, 300, 200)], 325, 100);
  assert.equal(a.x + center.dx + a.w / 2, 400);
});
test("magnet distance and release threshold are consistent at different zooms", () => {
  const a = note("a", 0, 0),
    b = note("b", 300, 180);
  for (const zoom of [0.5, 1, 3]) {
    const r = snapTranslation([a], [b], 300 - 5 / zoom, 0, { zoom });
    assert.equal(r.dx, 300);
    const sticky = snapTranslation([a], [b], 300 - 9 / zoom, 0, {
      zoom,
      previous: r.locks,
    });
    assert.equal(sticky.dx, 300);
    const free = snapTranslation([a], [b], 300 - 12 / zoom, 0, {
      zoom,
      previous: r.locks,
    });
    assert.notEqual(free.dx, 300);
  }
});
test("ignores far objects and excludes moving objects, descendants and hidden frame children", () => {
  const a = note("a", 0, 0),
    far = note("far", 300, 3000);
  assert.equal(snapTranslation([a], [far], 296, 0).dx, 296);
  const frame = {
    id: "f",
    type: "frame",
    x: 0,
    y: 0,
    w: 800,
    h: 800,
    collapsed: true,
  };
  const child = { ...note("child", 10, 10), frame: "f" };
  assert.deepEqual(
    alignmentTargets([frame, child, a, far], new Set(["a"])).map((n) => n.id),
    ["far"],
  );
  const grouped = [a, note("g", 143, 17)];
  const r = snapTranslation(grouped, [], 5, 5, { grid: true });
  assert.equal(grouped[1].x + r.dx - (a.x + r.dx), 143);
});
test("matches equal spacing after and between neighbours with dimension guides", () => {
  const a = note("a", 100, 100),
    b = note("b", 260, 100),
    moving = note("moving", 600, 100);
  const after = snapTranslation([moving], [a, b], -176, 0);
  assert.equal(moving.x + after.dx, 420);
  assert.deepEqual(
    after.guides.filter((g) => g.kind === "gap").map((g) => g.label),
    [40, 40],
  );
  const between = snapTranslation([moving], [a, note("b", 420, 100)], -336, 0);
  assert.equal(moving.x + between.dx, 260);
  assert.deepEqual(
    between.guides.filter((g) => g.kind === "gap").map((g) => g.label),
    [40, 40],
  );
});
test("alignment can be disabled independently of grid snapping", () => {
  const a = note("a", 13, 20),
    b = note("b", 307, 300);
  const free = snapTranslation([a], [b], 290, 100, { align: false });
  assert.equal(a.x + free.dx, 303);
  assert.deepEqual(free.guides, []);
  const grid = snapTranslation([a], [b], 290, 100, {
    align: false,
    grid: true,
  });
  assert.equal(a.x + grid.dx, 300);
});

test("resize snaps width and height independently ahead of grid rounding", () => {
  const moving = note("moving", 0, 0, 180, 140);
  const target = note("target", 300, 50, 247, 183);
  const r = snapResize(moving, moving, [target], 64, 40, { grid: true });
  assert.equal(r.w, 247);
  assert.equal(r.h, 183);
  assert.deepEqual(
    r.guides.map((g) => g.label),
    ["W 247", "W 247", "H 183", "H 183"],
  );
  assert.equal(moving.w, 180, "original geometry is untouched");
  const horizontal = snapResize(moving, moving, [target], 64, 40, {
    axis: "x",
  });
  assert.equal(horizontal.w, 247);
  assert.equal(horizontal.h, 140);
  assert.equal(horizontal.guides.length, 2);
  const vertical = snapResize(moving, moving, [target], 64, 40, { axis: "y" });
  assert.equal(vertical.w, 180);
  assert.equal(vertical.h, 183);
});

test("resize magnets acquire and release at consistent screen distances", () => {
  const moving = note("moving", 0, 0, 180, 140);
  const target = note("target", 260, 0, 247, 183);
  for (const zoom of [0.25, 1, 3]) {
    const r = snapResize(moving, moving, [target], 67 - 5 / zoom, 0, { zoom });
    assert.equal(r.w, 247);
    const sticky = snapResize(moving, moving, [target], 67 - 9 / zoom, 0, {
      zoom,
      previous: r.locks,
    });
    assert.equal(sticky.w, 247);
    const free = snapResize(moving, moving, [target], 67 - 12 / zoom, 0, {
      zoom,
      previous: r.locks,
    });
    assert.notEqual(free.w, 247);
    assert.deepEqual(free.guides, []);
  }
});

test("resize snapping respects minima, proximity, collapsed frames and bypass", () => {
  const moving = note("moving", 0, 0, 180, 140);
  const far = note("far", 4000, 0, 247, 183);
  const collapsed = {
    ...note("frame", 260, 0, 247, 183),
    type: "frame",
    collapsed: true,
  };
  const invalid = note("small", 260, 0, 118, 98);
  assert.equal(snapResize(moving, moving, [far, collapsed], 64, 40).w, 244);
  const minimum = snapResize(moving, moving, [invalid], -1000, -1000);
  assert.equal(minimum.w, 120);
  assert.equal(minimum.h, 100);
  assert.deepEqual(minimum.guides, []);
  const target = note("target", 260, 0, 247, 183);
  const free = snapResize(moving, moving, [target], 64, 40, { align: false });
  assert.equal(free.w, 244);
  assert.equal(free.h, 180);
  assert.deepEqual(free.guides, []);
  assert.equal(
    snapResize(moving, moving, [target], 64, 40, { align: false, grid: true })
      .w,
    240,
  );
});

test("resize prioritizes similar visible types for tied sizes, including converted notes", () => {
  const moving = note("moving", 0, 0, 180, 140);
  const shape = { ...note("a", 260, 0, 247, 183), type: "shape" };
  const taskNote = {
    ...note("b", 280, 0, 247, 183),
    type: "task",
    displayAs: "note",
  };
  assert.equal(
    snapResize(moving, moving, [shape, taskNote], 64, 40).locks.w,
    "b",
  );
});

test("all resize corners anchor the opposite corner after snapping and clamping", () => {
  const original = note("moving", 500, 400, 180, 140);
  const target = note("target", 750, 400, 247, 183);
  for (const corner of ["nw", "ne", "sw", "se"]) {
    const west = corner.includes("w"),
      north = corner.includes("n");
    const r = snapResize(
      original,
      original,
      [target],
      west ? -64 : 64,
      north ? -40 : 40,
      { corner, grid: true },
    );
    assert.equal(r.w, 247);
    assert.equal(r.h, 183);
    assert.equal(
      west ? r.x + r.w : r.x,
      west ? original.x + original.w : original.x,
    );
    assert.equal(
      north ? r.y + r.h : r.y,
      north ? original.y + original.h : original.y,
    );
    assert.equal(r.guides[0].start, r.x);
    assert.equal(r.guides[0].end, r.x + r.w);
    assert.equal(r.guides[2].start, r.y);
    assert.equal(r.guides[2].end, r.y + r.h);
    const clamped = snapResize(
      original,
      original,
      [],
      west ? 1000 : -1000,
      north ? 1000 : -1000,
      { corner },
    );
    assert.equal(clamped.w, 120);
    assert.equal(clamped.h, 100);
    assert.equal(
      west ? clamped.x + clamped.w : clamped.x,
      west ? original.x + original.w : original.x,
    );
    assert.equal(
      north ? clamped.y + clamped.h : clamped.y,
      north ? original.y + original.h : original.y,
    );
    const horizontal = snapResize(
      original,
      original,
      [],
      west ? -60 : 60,
      north ? -40 : 40,
      { corner, axis: "x", align: false },
    );
    assert.equal(horizontal.w, 240);
    assert.equal(horizontal.y, original.y);
    assert.equal(horizontal.h, original.h);
    const vertical = snapResize(
      original,
      original,
      [],
      west ? -60 : 60,
      north ? -40 : 40,
      { corner, axis: "y", align: false },
    );
    assert.equal(vertical.h, 180);
    assert.equal(vertical.x, original.x);
    assert.equal(vertical.w, original.w);
  }
});

test("north-west resize considers targets beside its new bounds", () => {
  const original = note("moving", 1000, 1000, 180, 140),
    target = note("target", -100, -100, 800, 800);
  const r = snapResize(original, original, [target], -616, -656, {
    corner: "nw",
  });
  assert.equal(r.w, 800);
  assert.equal(r.h, 800);
  assert.deepEqual([r.x, r.y], [380, 340]);
});
