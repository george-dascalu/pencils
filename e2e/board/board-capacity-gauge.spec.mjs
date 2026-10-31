// Board capacity gauge: a compact percentage of the 80,000-object and 10,000-frame limits that
// counts hidden frame children, explains itself in a popover beside the gauge (above it in the phone
// dock; click, Space or
// Enter; dismissed by click, Escape or outside), updates live on delete and undo, works on the
// expanded board, keeps 44px targets on phones and passes axe checks in light and dark. Since
// 0.20.81 (owner request, T9) it shows only past 80% of either limit, with the higher share.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { boardCapacityStats } from "../../public/board-capacity.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Capacity gauge" });
  const b = (await store.snapshot(project.id)).boards[0];
  const board = await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    nodes: [
      { id: "frame", type: "frame", text: "Ideas", x: 100, y: 150, w: 400, h: 300, collapsed: true },
      { id: "note", type: "sticky", text: "Inside the frame", x: 140, y: 240, w: 180, h: 130, frame: "frame" },
      { id: "other", type: "sticky", text: "Another idea", x: 600, y: 150, w: 180, h: 130 },
      // 8,049 more frames, out of view, take the board to 8,050 frames: 80.5% (81%) of the 10,000-frame limit.
      ...Array.from({ length: 8049 }, (_, i) => ({ id: `f${i}`, type: "frame", text: "", x: 20000 + (i % 100) * 120, y: 20000 + Math.floor(i / 100) * 120, w: 100, h: 100 })),
    ],
    edges: [{ id: "edge", from: "note", to: "other" }],
  });
  // A small board shows no gauge.
  const small = await store.createBoard(project.id, { title: "Small" });
  return { project, board, small };
});
// The desktop test deletes and restores objects; every test starts from the seeded board.
test.beforeEach(async () => {
  const board = (await app.store.snapshot(app.project.id)).boards[0];
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: app.board.nodes, edges: app.board.edges });
});
const gauge = (page) => page.locator("#board-capacity-toggle");
const info = (page) => page.locator("#board-capacity-info");
async function openBoard(page, board = app.board) {
  // Let the first presence heartbeat land and paint before using the controls.
  const presence = page.waitForResponse((r) => r.url().endsWith("/presence") && r.request().method() === "POST");
  await page.goto(`${app.base}/#project/${app.project.id}/board/${board.id}`);
  await gauge(page).waitFor();
  await presence;
  await expect(page.locator("#canvas-presence [data-pro=participant]")).toHaveAttribute("aria-label", /Just you|\d+ here/);
}

test("capacity percentages show <1% for tiny boards, the bar stops at 100%, and the gauge shows once it reads over 80% of either limit", () => {
  for (const [count, label, progress] of [[0, "0%", 0], [25, "<1%", 0.03125], [40000, "50%", 50], [80000, "100%", 100], [100000, "125%", 100]])
    expect(boardCapacityStats(count)).toMatchObject({ count, label, progress });
  for (const [count, frames, label, shown] of [[64000, 0, "80%", false], [64399, 0, "80%", false], [64400, 0, "81%", true], [10, 8049, "80%", false], [10, 8050, "81%", true], [70000, 9000, "90%", true]])
    expect(boardCapacityStats(count, frames), `${count} objects, ${frames} frames`).toMatchObject({ label, shown });
});

onDevices(["desktop", "phone"], () => test("a board under 80% of both limits shows no gauge", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.small.id}`);
  await page.locator(".board-capacity").waitFor({ state: "attached" });
  await expect(gauge(page)).toBeHidden();
}));

onDevices(["desktop", "phone"], () => {
  test("the gauge counts hidden frame children and explains itself next to the gauge, dismissed by click, Escape or outside", async ({ page, device }) => {
    await openBoard(page);
    const width = page.viewportSize().width;
    await expect(page.locator(".board-footer,.board-help,#canvas-performance")).toHaveCount(0);
    await expect(gauge(page)).toHaveAttribute("aria-label", /8,052 \/ 80,000 objects/);
    await expect(gauge(page)).toHaveAttribute("aria-label", /8,050 \/ 10,000 frames/);
    await expect(gauge(page), "the higher share, frames").toHaveText("81%");
    await expect(page.locator("[data-node=note]"), "hidden frame children still count").toHaveCount(0);
    const before = await page.locator("#canvas-world").getAttribute("style");
    await gauge(page).click();
    await expect(gauge(page)).toHaveAttribute("aria-expanded", "true");
    await expect(info(page)).toBeVisible();
    await expect(info(page).locator(".capacity-count")).toHaveText("8,052 / 80,000 objects");
    await expect(info(page).locator(".capacity-frame-count")).toHaveText("8,050 / 10,000 frames");
    const anchor = await gauge(page).boundingBox(), popup = await info(page).boundingBox();
    if (device === "phone") expect(popup.y + popup.height, "the explanation appears above the gauge in the dock").toBeLessThanOrEqual(anchor.y);
    else expect(popup.x >= anchor.x + anchor.width && Math.abs(popup.y - anchor.y) <= 1, `the explanation appears beside the gauge, to its right ${JSON.stringify({ popup, anchor })}`).toBe(true);
    expect(popup.x >= 0 && popup.x + popup.width <= width, JSON.stringify(popup)).toBe(true);
    await gauge(page).click();
    await expect(info(page)).toBeHidden();
    await gauge(page).focus();
    await page.keyboard.press("Space");
    await info(page).waitFor();
    await expect(page.locator("#canvas-world"), "keyboard activation does not move the board").toHaveAttribute("style", before);
    await page.keyboard.press("Escape");
    await info(page).waitFor({ state: "hidden" });
    await gauge(page).press("Enter");
    await info(page).waitFor();
    await page.locator(".topbar").click({ position: { x: 5, y: 5 } });
    await info(page).waitFor({ state: "hidden" });
  });

  test("the gauge and its explanation pass accessibility checks in light and dark and stay on screen", async ({ page, device }) => {
    await openBoard(page);
    const width = page.viewportSize().width;
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
      await gauge(page).click();
      await info(page).waitFor();
      const checks = await new AxeBuilder({ page }).include(".board-capacity").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(checks.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), `${theme} theme`).toEqual([]);
      const controls = await page.locator(".board-controls").boundingBox();
      expect(controls.x >= 0 && controls.x + controls.width <= width, JSON.stringify(controls)).toBe(true);
      if (device === "phone") {
        const r = await gauge(page).boundingBox();
        expect(r.width >= 44 && r.height >= 44, `44px target ${JSON.stringify(r)}`).toBe(true);
        const map = await page.locator("#canvas-minimap").boundingBox();
        if (map) expect(map.y + map.height, "the minimap stays above wrapped navigation controls").toBeLessThanOrEqual(controls.y);
      }
      await gauge(page).click();
    }
  });
});

test("deleting and undoing objects and frames update the counts live, the gauge goes at 80%, and the explanation opens beside the gauge on the expanded board", async ({ page }) => {
  await openBoard(page);
  const capacity = page.locator(".board-capacity");
  await page.locator("[data-node=other]").click();
  await page.keyboard.press("Delete");
  await expect(capacity).toHaveAttribute("data-count", "8051");
  await expect(gauge(page)).toHaveAttribute("aria-label", /8,051 \/ 80,000 objects/);
  await expect(page.locator("#board-save")).toHaveText("Saved automatically");
  await page.keyboard.press("Control+z");
  await expect(capacity).toHaveAttribute("data-count", "8052");
  await page.locator("[data-node=frame] .frame-title").click();
  await page.keyboard.press("Delete");
  await expect(capacity).toHaveAttribute("data-frame-count", "8049");
  await expect(gauge(page), "80.49% of the frames reads 80%: no gauge").toBeHidden();
  await page.keyboard.press("Control+z");
  await expect(capacity).toHaveAttribute("data-frame-count", "8050");
  await expect(gauge(page)).toBeVisible();
  await expect(info(page).locator(".capacity-frame-count")).toHaveText("8,050 / 10,000 frames");
  await page.locator("#board-expand").click();
  await page.locator(".board-expanded").waitFor();
  await gauge(page).click();
  await info(page).waitFor();
  const [popup, anchor] = [await info(page).boundingBox(), await gauge(page).boundingBox()];
  expect(popup.x, "beside the gauge, to its right").toBeGreaterThanOrEqual(anchor.x + anchor.width);
});
