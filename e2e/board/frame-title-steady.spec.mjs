// Owner request (F0.22-2, 4 November 2026, desktop screenshots): a Project frame's title moved
// slightly when the frame was collapsed or expanded. The title keeps its place, level with the
// frame's header buttons, in both states, for plain frames too.
import { test, expect, useApp } from "../fixtures.mjs";
import { seedBoard, boardSettled } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Frame titles" });
  await seedBoard(store, project.id, {
    nodes: [
      { id: "plan", type: "frame", projectFrame: true, text: "A little more possibility", x: 40, y: 80, w: 900, h: 300 },
      { id: "plain", type: "frame", text: "Plain frame", x: 40, y: 480, w: 600, h: 300 },
    ],
    edges: [],
  });
  return { project };
});
test.use({ viewportSize: { width: 1400, height: 1000 } });

for (const id of ["plan", "plain"]) test(`a ${id === "plan" ? "Project" : "plain"} frame's title stays put when the frame collapses and expands`, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const frame = page.locator(`[data-node="${id}"]`), toggle = frame.locator(':scope > [data-pro="collapse"]');
  await expect(toggle).toBeVisible();
  await boardSettled(page);
  // Title text and toggle relative to the frame, in screen pixels.
  const place = () => frame.evaluate((el) => {
    const f = el.getBoundingClientRect(), title = el.querySelector(".frame-title, .node-text"), range = document.createRange();
    range.selectNodeContents(title);
    const t = range.getBoundingClientRect(), b = el.querySelector(':scope > [data-pro="collapse"]').getBoundingClientRect();
    return { left: t.left - f.left, middle: (t.top + t.bottom) / 2 - f.top, button: (b.top + b.bottom) / 2 - f.top };
  });
  const open = await place();
  await toggle.click();
  await expect(frame).toHaveClass(/collapsed-frame/);
  const shut = await place();
  expect(Math.abs(shut.middle - open.middle), `title middle ${open.middle} → ${shut.middle}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(shut.left - open.left)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(open.middle - open.button), "level with the header buttons").toBeLessThanOrEqual(2);
  await toggle.click();
  await expect(frame).not.toHaveClass(/collapsed-frame/);
  expect(Math.abs((await place()).middle - open.middle)).toBeLessThanOrEqual(0.5);
  // Editing the title in place (plain frames; a Project frame's title comes from its project) keeps the text where it was.
  if (id !== "plain") return;
  const before = await frame.locator(".frame-title").boundingBox();
  await frame.locator(".frame-title").dblclick();
  const editor = page.locator("#canvas-inline-form .inline-rich");
  await expect(editor).toBeVisible();
  const during = await editor.boundingBox();
  expect(Math.abs(during.y - before.y), `title top ${before.y} → ${during.y} while editing`).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
});
