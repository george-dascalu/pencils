// Owner request T40, 1 November 2026 (T76, audit B13): the board's tool rail shows icons only, with
// no group name left over its tools, and the board's secondary text reads at 4.5:1 in both themes.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Rail", key: "RL" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});
// The text's contrast with the first opaque background behind it.
const contrast = (locator) => locator.evaluate((el) => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  let node = el, bg;
  while (node && ((bg = rgb(getComputedStyle(node).backgroundColor)).length < 3 || bg[3] === 0)) node = node.parentElement;
  const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(node ? bg : [255, 255, 255])].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
});

test("the tool rail shows icons only, and the board's secondary text is readable in both themes", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator(".board-empty").waitFor();
  expect(await page.locator(".board-tools-scroll").evaluate((el) => el.innerText.trim()), "no group names over the tools").toBe("");
  await expect(page.getByRole("group", { name: "Arrange", exact: true }), "groups keep their names for screen readers").toHaveCount(1);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
    for (const selector of [".board-empty h3", ".board-empty p", ".board-zoom", '.board-tools button[data-tool="hand"]'])
      expect(await contrast(page.locator(selector).first()), `${theme}: ${selector}`).toBeGreaterThanOrEqual(4.5);
  }
});
