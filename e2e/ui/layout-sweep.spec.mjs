// T46: a layout sweep of every view on desktop, iPad, phone and a phone held sideways, in its
// usual states (the document and board lists, the touch tray, phone View options). Layout bugs
// found by eye (a gap above Home on phones, a list panel short of the page sideways, a panel over
// the bottom bar) break one of these rules: the page never scrolls sideways, open panels stay on
// the screen, nothing covers the bottom bar, and content starts right below the bars.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Sweep", key: "SW" });
  const parent = await store.createTask(project.id, { title: "A card with a long readable title for the rows", status: "in-progress", priority: "high", assignee: "Ann", start: "2026-11-02", due: "2026-11-06", estimate: 5, tags: ["alpha"] });
  await store.createTask(project.id, { title: "Child card", status: "todo", due: "2026-11-04", parent: parent.id });
  const doc = await store.createDocument(project.id, { title: "Notes", body: "# Notes\n\nSome text.\n" });
  return { project, doc, board: (await store.snapshot(project.id)).boards[0] };
});
const SCREENS = {
  home: () => "",
  overview: () => `#project/${app.project.id}/overview`,
  documents: () => `#project/${app.project.id}/documents/${app.doc.id}`,
  list: () => `#project/${app.project.id}/list`,
  tree: () => `#project/${app.project.id}/tree`,
  table: () => `#project/${app.project.id}/table`,
  kanban: () => `#project/${app.project.id}/kanban`,
  board: () => `#project/${app.project.id}/board/${app.board.id}`,
  calendar: () => `#project/${app.project.id}/calendar`,
  timeline: () => `#project/${app.project.id}/timeline`,
  capacity: () => `#project/${app.project.id}/capacity`,
  settings: () => `#project/${app.project.id}/settings/general`,
};
const TABS = { list: "tasks", tree: "tasks", table: "tasks", kanban: "tasks", calendar: "planning", timeline: "planning", capacity: "planning", documents: "documents" };

// Every rule the page breaks, as text. The device's own width counts: a phone zooms a page that's
// too wide out, which widens innerWidth with it. Views that scroll sideways inside themselves
// (Table, Kanban, Timeline) are fine; only the page itself must not.
const problems = (page) => page.evaluate(({ width: vw, height: vh }) => {
  const found = [];
  if (document.documentElement.scrollWidth > vw + 1) found.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px wide)`);
  for (const el of document.querySelectorAll("#list-panel:not([hidden]), .layout-tray, .mobile-view-options-panel")) {
    const r = el.getBoundingClientRect();
    if (r.width && (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1)) found.push(`${el.id || el.classList[0]} runs off the ${vw}×${vh} screen: ${["left", "top", "right", "bottom"].map((k) => Math.round(r[k])).join(", ")}`);
  }
  const bar = matchMedia("(max-width: 600px), (pointer: coarse)").matches ? document.querySelector("nav.tabs") : null;
  if (bar?.getClientRects().length) {
    const r = bar.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!bar.contains(hit)) found.push(`the bottom bar is covered by ${hit?.id || hit?.classList[0] || hit?.tagName}`);
  }
  // Content starts right below the top bar and the toolbar row.
  const content = document.querySelector(".home, #view-content > :not(.hidden)"), above = [...document.querySelectorAll(".topbar, #view-toolbar")].filter((el) => el.getClientRects().length && getComputedStyle(el).position !== "fixed");
  if (content && above.length) {
    const gap = content.getBoundingClientRect().top - Math.max(...above.map((el) => el.getBoundingClientRect().bottom));
    if (gap > 24) found.push(`a ${Math.round(gap)}px gap above the content`);
  }
  return found;
}, page.viewportSize());
// A full load each time: going to the same address only changes the hash, which keeps panels open.
async function open(page, screen) {
  await page.goto("about:blank");
  await page.goto(`${app.base}/${SCREENS[screen]()}`);
  await page.locator(screen === "home" ? ".home" : screen === "board" ? "#canvas" : "#view-content > *").first().waitFor();
  await expect(page.locator("#view-content")).not.toContainText("Opening view");
}
const touch = (page) => page.evaluate(() => matchMedia("(max-width: 600px), (pointer: coarse)").matches);

function sweep() {
  for (const screen of Object.keys(SCREENS))
    test(screen, async ({ page }) => {
      await open(page, screen);
      await expect.poll(() => problems(page), { message: screen }).toEqual([]);
      if (TABS[screen] && (await touch(page))) {
        await page.locator(`.tabs [data-view="${TABS[screen]}"]`).click();
        await page.locator(".layout-tray").waitFor();
        await expect.poll(() => problems(page), { message: `${screen} with the tray open` }).toEqual([]);
        await page.keyboard.press("Escape");
      }
      if (["documents", "board"].includes(screen)) {
        await open(page, screen);
        if (screen === "documents") {
          await page.locator('.tabs [data-view="documents"]').click();
          await page.locator(".layout-tray").getByRole("button", { name: "Documents", exact: true }).click();
        } else await page.locator(`.tabs [data-view="${screen}"][aria-current="page"]`).click();
        await page.locator("#list-panel").waitFor();
        await expect.poll(() => problems(page), { message: `${screen} with its list open` }).toEqual([]);
      }
      const options = page.locator(".mobile-view-options > summary");
      // Phones keep the task and planning views' controls in View options.
      if (TABS[screen] && TABS[screen] !== "documents" && page.viewportSize().width <= 600) await expect(options, "View options").toBeVisible();
      if (await options.isVisible()) {
        await open(page, screen);
        await options.click();
        await page.locator(".mobile-view-options-panel").waitFor();
        await expect.poll(() => problems(page), { message: `${screen} with View options open` }).toEqual([]);
      }
    });
}
onDevices(["desktop", "ipad", "ipad-portrait", "phone"], sweep);
test.describe("phone held sideways", () => {
  test.use({ device: "phone", viewportSize: { width: 844, height: 390 } });
  sweep();
});
