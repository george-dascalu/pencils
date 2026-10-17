import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "pencils-connector-zoom-"),
);
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Stable arrow labels" });
const board = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    { id: "a", type: "sticky", text: "First", x: 100, y: 150, w: 200, h: 160 },
    { id: "b", type: "sticky", text: "Second", x: 600, y: 150, w: 200, h: 160 },
    { id: "c", type: "sticky", text: "Child", x: 180, y: 450, w: 200, h: 160 },
  ],
  edges: [
    {
      id: "regular",
      from: "a",
      to: "b",
      label: "Stable label",
      labelOffset: { x: 5, y: -8 },
      labels: [{ text: "Extra", x: 0, y: 25 }],
    },
    {
      id: "plan",
      from: "a",
      to: "c",
      planRelation: "parent",
      routing: "elbow",
      fromSide: "bottom",
      toSide: "left",
      label: "parent / child",
    },
  ],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 1000 },
  deviceScaleFactor: Number(process.env.DPR || 1),
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.locator('.edge-label[data-edge="regular"]').first().waitFor();
  // Let the initial collaboration snapshot settle before tracking DOM identity.
  await page.waitForTimeout(1800);
  // Select the arrow to include its zoom-adjusted handles and hit targets.
  await page.locator('.edge-label[data-edge="regular"]').first().click();
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const svg = document.querySelector("#canvas-lines");
    window.zoomLabels = [...svg.querySelectorAll(".edge-label")].map((el) => {
      // Firefox includes the text's stroke in client bounds; Chromium does not.
      // Capture each browser's initial painted bounds in board coordinates.
      const rect = el.getBoundingClientRect(),
        inverse = el.getScreenCTM().inverse();
      const start = new DOMPoint(rect.left, rect.top).matrixTransform(inverse);
      const end = new DOMPoint(rect.right, rect.bottom).matrixTransform(
        inverse,
      );
      return {
        el,
        x: el.getAttribute("x"),
        y: el.getAttribute("y"),
        box: {
          x: start.x,
          y: start.y,
          width: end.x - start.x,
          height: end.y - start.y,
        },
      };
    });
    window.labelZoomErrors = [];
    window.zoomSamples = 0;
    window.maxLabelDrift = 0;
    window.sampleZoom = true;
    function sample() {
      if (!window.sampleZoom) return;
      for (const { el, x, y, box } of window.zoomLabels) {
        if (!el.isConnected)
          window.labelZoomErrors.push("Label was replaced during zoom");
        else if (el.getAttribute("x") !== x || el.getAttribute("y") !== y)
          window.labelZoomErrors.push("Label moved in board coordinates");
        else {
          const rect = el.getBoundingClientRect();
          const expected = new DOMPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ).matrixTransform(el.getScreenCTM());
          window.maxLabelDrift = Math.max(
            window.maxLabelDrift,
            Math.abs(
              rect.x -
                new DOMPoint(box.x, box.y).matrixTransform(el.getScreenCTM()).x,
            ),
            Math.abs(
              rect.y -
                new DOMPoint(box.x, box.y).matrixTransform(el.getScreenCTM()).y,
            ),
          );
          if (
            Math.abs(rect.x + rect.width / 2 - expected.x) > 1 ||
            Math.abs(rect.y + rect.height / 2 - expected.y) > 1
          )
            window.labelZoomErrors.push(
              "Text drifted from the board transform",
            );
        }
      }
      window.zoomSamples++;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  for (const delta of [-300, -300, -300, 300, 300, 300, 300, 300, -300, -300]) {
    await page.locator("#canvas").dispatchEvent("wheel", {
      deltaY: delta,
      clientX: 850,
      clientY: 450,
      bubbles: true,
      cancelable: true,
    });
    await page.waitForTimeout(140);
  }
  await page.waitForFunction(
    () => !document.querySelector("#canvas").classList.contains("zooming"),
  );
  await page.waitForTimeout(1400);
  const result = await page.evaluate(() => {
    window.sampleZoom = false;
    return {
      errors: [...new Set(window.labelZoomErrors)],
      frames: window.zoomSamples,
      maxDrift: window.maxLabelDrift,
    };
  });
  console.log("Maximum label drift (pixels)", result.maxDrift);
  assert.ok(
    result.maxDrift < 0.1,
    `Text drifted ${result.maxDrift}px from its original painted bounds`,
  );
  assert.ok(result.frames > 20);
  assert.deepEqual(result.errors, []);
  // Labels remain editable after camera reconciliation.
  await page.keyboard.press("Enter");
  await page.locator('[data-edge-field="label"]').fill("Still editable");
  await page.locator('[data-edge-field="label"]').press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector('.edge-label[data-edge="regular"]')
        ?.textContent === "Still editable",
  );
  await page.reload();
  await page.locator('.edge-label[data-edge="regular"]').first().waitFor();
  assert.equal(
    await page
      .locator('.edge-label[data-edge="regular"]')
      .first()
      .textContent(),
    "Still editable",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: arrow label DOM, board coordinates and screen transforms remain stable throughout repeated zoom; editing and reload still work",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
