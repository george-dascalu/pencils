// Owner request, 29 October 2026: on phones, the swipe in from the left screen edge (Safari's
// "back" gesture) opens the sidebar instead. It starts in the 20px gutter that the edge guard
// (public/scroll-gestures.js) already keeps from Safari, and must travel mostly sideways.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Edge swipe", key: "ES" });
  for (let i = 0; i < 30; i++) await store.createTask(project.id, { title: `Task ${i}` });
  return { project };
});
// A real touch swipe through the browser's input pipeline.
// A second finger 150px lower makes it a two-finger swipe.
async function swipe(page, from, to, { fingers = 1 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const points = (x, y) => Array.from({ length: fingers }, (_, i) => ({ x, y: y + i * 150, id: i }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from.x, from.y) });
  for (let i = 1; i <= 6; i++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const settled = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
};

onDevices(["phone"], () => {
  test("swiping in from the left edge opens the sidebar and stays on the page", async ({ page }) => {
    await open(page);
    const url = page.url();
    await swipe(page, { x: 4, y: 400 }, { x: 160, y: 410 });
    await expect(page.locator(".sidebar.open")).toBeVisible();
    await expect(page.locator(".mobile-menu")).toHaveAttribute("aria-expanded", "true");
    expect(page.url()).toBe(url);
  });

  test("scrolling down from the edge, or swiping from mid-screen, leaves the sidebar closed", async ({ page }) => {
    await open(page);
    await swipe(page, { x: 4, y: 600 }, { x: 30, y: 300 });
    await swipe(page, { x: 120, y: 400 }, { x: 300, y: 410 });
    await swipe(page, { x: 4, y: 300 }, { x: 160, y: 310 }, { fingers: 2 });
    await settled(page);
    await expect(page.locator(".sidebar.open")).toHaveCount(0);
  });

  test("a sideways drag in a text field or on the Table keeps the sidebar closed", async ({ page }) => {
    await open(page);
    // A text field reaching the left edge, as a full-width editor would.
    await page.evaluate(() => document.querySelector("#view-content").insertAdjacentHTML("afterbegin", '<input id="edge-field" style="position:fixed;left:0;top:300px;width:200px;height:60px;z-index:50">'));
    await swipe(page, { x: 4, y: 330 }, { x: 160, y: 335 });
    await settled(page);
    await expect(page.locator(".sidebar.open")).toHaveCount(0);
    await page.goto(`${app.base}/#project/${app.project.id}/table`);
    const table = await page.locator(".table-scroll").boundingBox();
    await swipe(page, { x: 4, y: table.y + 120 }, { x: 160, y: table.y + 125 });
    await settled(page);
    await expect(page.locator(".sidebar.open")).toHaveCount(0);
  });
});
