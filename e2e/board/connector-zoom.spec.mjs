// Arrow labels stay put while zooming: through repeated wheel zoom and the camera's later
// reconciliation, each label keeps its DOM element, its board coordinates and its painted
// place under the board transform; labels stay editable afterwards and survive a reload.
import { test, expect, useApp } from "../fixtures.mjs";
import { boardSettled, savesSettled, savedBoard } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
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
      { id: "regular", from: "a", to: "b", label: "Stable label", labelOffset: { x: 5, y: -8 }, labels: [{ text: "Extra", x: 0, y: 25 }] },
      { id: "plan", from: "a", to: "c", planRelation: "parent", routing: "elbow", fromSide: "bottom", toSide: "left", label: "parent / child" },
    ],
  });
  return { project };
});

test.use({ viewportSize: { width: 1500, height: 1000 } });

test("arrow labels keep their element, board position and painted place through repeated zoom, and stay editable", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const label = page.locator('.edge-label[data-edge="regular"]').first();
  await label.waitFor();
  await boardSettled(page);
  // Select the arrow to include its zoom-adjusted handles and hit targets.
  await label.click();
  await expect(page.getByRole("toolbar", { name: "Selected connector" })).toBeVisible();
  await page.evaluate(() => {
    const svg = document.querySelector("#canvas-lines");
    window.zoomLabels = [...svg.querySelectorAll(".edge-label")].map((el) => {
      // Firefox includes the text's stroke in client bounds; Chromium does not.
      // Capture each browser's initial painted bounds in board coordinates.
      const rect = el.getBoundingClientRect(), inverse = el.getScreenCTM().inverse();
      const start = new DOMPoint(rect.left, rect.top).matrixTransform(inverse);
      const end = new DOMPoint(rect.right, rect.bottom).matrixTransform(inverse);
      return { el, x: el.getAttribute("x"), y: el.getAttribute("y"), box: { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y } };
    });
    window.labelZoomErrors = [];
    window.zoomSamples = 0;
    window.maxLabelDrift = 0;
    window.sampleZoom = true;
    // The board records each camera reconciliation on #canvas (data-render-ms).
    window.reconciledAt = [];
    new MutationObserver(() => window.reconciledAt.push(performance.now())).observe(document.querySelector("#canvas"), { attributes: true, attributeFilter: ["data-render-ms"] });
    let transform = "";
    function sample() {
      if (!window.sampleZoom) return;
      const now = document.querySelector("#canvas-world").style.transform;
      if (now !== transform) [transform, window.cameraMovedAt] = [now, performance.now()];
      for (const { el, x, y, box } of window.zoomLabels) {
        if (!el.isConnected) window.labelZoomErrors.push("Label was replaced during zoom");
        else if (el.getAttribute("x") !== x || el.getAttribute("y") !== y) window.labelZoomErrors.push("Label moved in board coordinates");
        else {
          const rect = el.getBoundingClientRect();
          const origin = new DOMPoint(box.x, box.y).matrixTransform(el.getScreenCTM());
          const expected = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(el.getScreenCTM());
          window.maxLabelDrift = Math.max(window.maxLabelDrift, Math.abs(rect.x - origin.x), Math.abs(rect.y - origin.y));
          if (Math.abs(rect.x + rect.width / 2 - expected.x) > 1 || Math.abs(rect.y + rect.height / 2 - expected.y) > 1)
            window.labelZoomErrors.push("Text drifted from the board transform");
        }
      }
      window.zoomSamples++;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  for (const delta of [-300, -300, -300, 300, 300, 300, 300, 300, -300, -300]) {
    const frames = await page.evaluate(() => window.zoomSamples);
    await page.locator("#canvas").dispatchEvent("wheel", { deltaY: delta, clientX: 850, clientY: 450, bubbles: true, cancelable: true });
    // Let each step animate for a few frames before the next one, as a person's scrolling would.
    await page.waitForFunction((n) => window.zoomSamples >= n, frames + 8);
  }
  await expect(page.locator("#canvas")).not.toHaveClass(/\bzooming\b/);
  // Keep sampling through the camera's delayed clean-up, which reconciles the board
  // about a second after the camera last moved.
  await page.waitForFunction(() => window.reconciledAt.some((t) => t > window.cameraMovedAt + 1000), null, { timeout: 10000 });
  const result = await page.evaluate(() => {
    window.sampleZoom = false;
    return { errors: [...new Set(window.labelZoomErrors)], frames: window.zoomSamples, maxDrift: window.maxLabelDrift };
  });
  expect(result.maxDrift, `Text drifted ${result.maxDrift}px from its original painted bounds`).toBeLessThan(0.1);
  expect(result.frames).toBeGreaterThan(20);
  expect(result.errors).toEqual([]);
  // Labels remain editable after camera reconciliation.
  await page.keyboard.press("Enter");
  await page.locator('[data-edge-field="label"]').fill("Still editable");
  await page.locator('[data-edge-field="label"]').press("Enter");
  await expect(label).toHaveText("Still editable");
  await expect.poll(async () => (await savedBoard(app.store, app.project.id)).edges.find((e) => e.id === "regular").label).toBe("Still editable");
  await savesSettled(page);
  await page.reload();
  await expect(label).toHaveText("Still editable");
});
