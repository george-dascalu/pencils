// Fixes from the UI audit: focus returns to the opener when the card editor closes,
// checklists are labelled, uploads work by keyboard, an invalid close offers to keep a
// draft, kanban cards move by keyboard, board cards and the task editor share one comment
// thread (including legacy board threads), board cards are accessible groups, every view
// stays usable from 320px phones to desktop in both themes, and the production build loads
// within budget on a slow connection (PRODUCTION_ASSETS=1). AUDIT_OUTPUT=<dir> saves
// screenshots of the responsive views as evidence.
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { test, expect, onDevices, useApp, startApp } from "../fixtures.mjs";

const seed = async (store) => {
  const project = await store.createProject({ title: "Audit fixes", key: "FIX" });
  const tasks = [];
  for (let i = 0; i < 8; i++) tasks.push(await store.createTask(project.id, {
    title: i === 0 ? "Review mobile navigation and keyboard accessibility" : `Release task ${i}`,
    status: "backlog", order: i * 1024, assignee: i % 2 ? "George" : "",
    priority: i % 2 ? "urgent" : "medium", due: "2026-10-25",
    body: "- [ ] Keyboard access\n- [x] Save changes",
  }));
  await store.createDocument(project.id, { title: "Checklist", body: tasks[0].body });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "card", type: "task", task: tasks[0].id, x: 80, y: 100, w: 380, h: 260, comments: [
        { id: "legacy", author: "George", text: "Legacy board comment", created: "2026-10-19T12:00:00Z" },
        { id: "reply", replyTo: "legacy", author: "George", text: "Legacy reply", created: "2026-10-19T12:01:00Z" },
      ] },
      { id: "card-copy", type: "task", task: tasks[0].id, x: 500, y: 100, w: 380, h: 260 },
      { id: "note", type: "sticky", text: "Readable custom fill", color: "#f4e1a1", x: 100, y: 450, w: 250, h: 160 },
    ], edges: [],
  });
  return { project, tasks };
};
const app = useApp(seed);

const ready = {
  list: ".task-row", tree: ".tree-wrapper", table: ".spreadsheet", kanban: ".kanban",
  board: "#canvas", documents: ".documents-workspace", timeline: ".task-timeline",
  calendar: ".calendar,.calendar-agenda", overview: ".project-overview", capacity: ".capacity-view",
};
// The query string forces a fresh page load for each view.
async function openView(page, view, target = app) {
  await page.goto(`${target.base}/?audit=${view}#project/${target.project.id}/${view}`);
  await page.locator(ready[view]).first().waitFor();
}
const task = async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.tasks[0].id);

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });

  test("closing the card editor with Escape or its close button returns focus to the opener in list, tree, table and kanban", async ({ page }) => {
    const id = app.tasks[0].id;
    for (const view of ["list", "tree", "table", "kanban"]) {
      await openView(page, view);
      const opener = page.locator(`[data-action="task-open"][data-id="${id}"]`).first();
      for (const close of ["escape", "button"]) {
        await opener.click();
        await page.locator("#task-form [name=title]").focus();
        if (view === "list" && close === "escape") {
          await page.locator("#task-form [name=title]").fill("Review mobile navigation after autosave");
          await expect.poll(async () => (await task()).title).toBe("Review mobile navigation after autosave");
        }
        if (close === "escape") await page.keyboard.press("Escape");
        else await page.locator('[data-action="dialog-close"]').click();
        await page.waitForFunction((id) => document.activeElement?.dataset.id === id, id);
      }
    }
  });

  test("checklists are labelled, uploads work by keyboard, and closing with an empty title offers to keep a draft", async ({ page }) => {
    await openView(page, "list");
    await page.locator(".task-row > .task-id").first().click();
    expect(await page.locator("#task-form input[type=checkbox][disabled]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(["Keyboard access", "Save changes"]);
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator(".task-attachment-choose").focus();
    await page.keyboard.press("Enter");
    await (await chooserPromise).setFiles({ name: "keyboard.txt", mimeType: "text/plain", buffer: Buffer.from("Keyboard upload") });
    await page.locator("[data-attachment-file]").waitFor();
    await page.locator("#task-form [name=title]").fill("");
    await page.locator('[data-action="dialog-close"]').click();
    await page.locator(".task-close-notice").waitFor();
    await expect(page.locator("#task-form")).toHaveCount(1);
    await page.locator("[data-keep-draft]").click();
    await page.locator(".task-row > .task-id").first().click();
    await page.locator(".draft-notice").waitFor();
    await page.locator('[data-feature="form-discard"]').click();
    await page.locator('[data-action="dialog-close"]').click();
  });

  test("Alt+ArrowDown moves a kanban card, keeps its focus and saves the order", async ({ page }) => {
    await openView(page, "kanban");
    const id = app.tasks[0].id;
    const order = (await task()).order;
    const cards = () => page.locator("[data-drag-task]").evaluateAll((els) => els.map((el) => el.dataset.dragTask));
    const before = await cards();
    await page.locator(`[data-drag-task="${id}"] .task-title`).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect.poll(async () => (await cards()).indexOf(id)).toBe(before.indexOf(id) + 1);
    expect(await page.evaluate(() => document.activeElement.dataset.id)).toBe(id);
    await expect.poll(async () => (await task()).order).not.toBe(order);
  });

  test("board cards and the task editor share one comment thread, including legacy board comments", async ({ page }) => {
    await openView(page, "board");
    await page.locator("[data-node=card] [data-pro=comments]").click();
    // Since 0.18.8 the reply also quotes this comment; check the comment itself.
    await page.locator(".board-comments-list p").filter({ hasText: /^Legacy board comment$/ }).waitFor();
    await page.locator("#board-comment-form .inline-rich").fill("One shared task conversation");
    await page.locator("[data-comment-submit]").click();
    await expect.poll(async () => (await task()).comments?.length).toBe(3);
    const comments = (await task()).comments;
    expect(comments.find((c) => c.text === "Legacy reply").replyTo).toBe(comments.find((c) => c.text === "Legacy board comment").id);
    await page.locator("[data-comments-close]").click();
    await page.locator("[data-node=card-copy] [data-pro=comments]").click();
    await page.getByText("One shared task conversation", { exact: true }).waitFor();
    await page.locator("[data-comments-close]").click();
    await expect(page.locator("[data-node=card]")).toHaveAttribute("role", "group");
    const boardScan = await new AxeBuilder({ page }).withRules(["nested-interactive", "label", "aria-prohibited-attr", "color-contrast"]).analyze();
    const onNodes = boardScan.violations.filter((v) => v.nodes.some((n) => n.target.join("").includes("data-node")));
    expect(onNodes, JSON.stringify(boardScan.violations)).toHaveLength(0);

    await openView(page, "list");
    await page.locator(`[data-action=task-open][data-id="${app.tasks[0].id}"]`).first().click();
    await page.locator('[data-feature="task-comments"]').first().click();
    await page.getByText("One shared task conversation", { exact: true }).waitFor();
    await page.locator("#board-comment-form .inline-rich").fill("Reply from the task editor");
    await page.locator("[data-comment-submit]").click();
    await expect.poll(async () => (await task()).comments?.length).toBe(4);
    // Since 0.19.0 Comments is a pane of the task panel without its own close
    // button; Escape in the pane returns to Details.
    await page.keyboard.press("Escape");
    await page.locator(".task-dialog .task-comments-panel").waitFor({ state: "hidden" });
    await page.locator('[data-action="dialog-close"]').click();
    await openView(page, "board");
    await page.locator("[data-node=card] [data-pro=comments]").click();
    await page.getByText("Reply from the task editor", { exact: true }).waitFor();
    expect((await task()).comments, "Reopening a legacy thread does not duplicate it").toHaveLength(4);
    await page.locator("[data-comments-close]").click();
    await expect(page.locator(".task-comment-count")).toHaveText(["4", "4"]);
  });
});

// Every view at phone, small phone, tablet and desktop widths (touch below 1000px), in both themes.
const views = {
  list: "list rows keep a readable title and a labelled due date",
  tree: "tree rows keep a readable title and a labelled due date",
  table: "the table keeps its key column, touch-sized open targets and a compact phone layout",
  timeline: "the timeline marks today as an image",
  documents: "documents render",
  calendar: "calendar agenda rows keep 44px touch targets",
  kanban: "kanban renders",
  overview: "the overview renders",
  capacity: "capacity renders",
  board: "board card controls scale with the card without overlapping",
};
const widths = { phone: [320, 390], "ipad-portrait": [768], desktop: [1500] };

async function checkView(page, view, width, theme) {
  if (["list", "tree"].includes(view)) {
    // Since 0.18.23 phone rows (600px and below) show a title-and-metadata
    // summary in place of the row fields.
    const box = await page.locator(width <= 600 ? ".phone-task-title" : ".row-title").first().boundingBox();
    expect(box.x < width - 100 && box.width >= 100, `${width} ${view}: title ${JSON.stringify(box)}`).toBe(true);
    const date = page.locator(".row-due").first();
    expect(await date.getAttribute("aria-label")).toContain((await date.innerText()).trim());
  }
  if (view === "table") {
    await expect(page.locator(".spreadsheet .task-id").first()).not.toHaveCSS("display", "none");
    if (width < 1000) {
      const box = await page.locator(width <= 600 ? ".phone-table-key" : ".table-open").first().boundingBox();
      expect(box.width >= 44 && box.height >= 44, JSON.stringify(box)).toBe(true);
    }
    if (width < 600) {
      const box = await page.locator(".table-scroll").boundingBox();
      expect(box.y, `Table starts at ${box.y}`).toBeLessThan(350);
      await page.locator(".mobile-view-options > summary").click();
      await page.locator('[data-board-menu="table-groups"] > summary').click();
      // Menu fields stay mounted with their original handlers. (The old suite only counted
      // a stale #table-group-primary selector; this checks the current group field.)
      await expect(page.locator('[data-board-menu="table-groups"] [data-table-group="0"]')).toBeVisible();
      await page.keyboard.press("Escape");
      await page.locator('.mobile-view-options-panel [aria-label="Close view options"]').click();
    }
  }
  if (view === "timeline") {
    const marker = page.locator(".timeline-today").first();
    if (await marker.count()) await expect(marker).toHaveAttribute("role", "img");
  }
  if (view === "calendar" && width < 1000) {
    for (const button of await page.locator(".agenda-row > button").all()) {
      if (await button.isVisible()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  }
  if (view === "board" && width === 390) {
    // Since 0.18.20 card controls belong to the board's coordinate space and
    // scale with the card instead of growing to 44px on screen: each keeps
    // the board control size at the current zoom (card is 380 units wide).
    const scale = (await page.locator("[data-node=card]").boundingBox()).width / 380;
    const size = scale * parseFloat(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--board-control-height")));
    for (const selector of ["[data-pro=comments]", "[data-pro=task-details]", ".canvas-task-priority", ".canvas-task-status", ".canvas-task-assignee"]) {
      const box = await page.locator(`[data-node=card] ${selector}`).boundingBox();
      expect(box.width >= size - 0.5 && box.height >= size - 0.5, `${selector}: ${JSON.stringify(box)} < ${size}`).toBe(true);
    }
    // Since 0.19.9 fields run assignee, status, priority.
    const priority = await page.locator("[data-node=card] .canvas-task-priority").boundingBox();
    const status = await page.locator("[data-node=card] .canvas-task-status").boundingBox();
    expect(status.x + status.width, "Card field targets do not overlap").toBeLessThanOrEqual(priority.x);
  }
  if (process.env.AUDIT_OUTPUT && [390, 1500].includes(width) && ["list", "table", "board", "documents"].includes(view))
    await page.screenshot({ path: path.join(process.env.AUDIT_OUTPUT, `${width}-${theme}-${view}.png`) });
}

onDevices(Object.keys(widths), (device) => {
  for (const width of widths[device])
    test.describe(`${width}px`, () => {
      test.use({ viewportSize: { width, height: 1000 } });
      for (const [view, behaviour] of Object.entries(views))
        test(`${behaviour} in light and dark`, async ({ page }) => {
          await openView(page, view);
          for (const theme of ["light", "dark"]) {
            await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
            await checkView(page, view, width, theme);
          }
        });
      if (width < 600)
        test("phone card comments fill the width and the panes switch between details, comments and history", async ({ page }) => {
          await openView(page, "list");
          // Phone rows open the card from their summary button (0.18.23).
          await page.locator(".task-row .phone-task-open").first().click();
          await page.locator('[data-editor-pane="comments"]').click();
          await page.locator(".task-comments-panel").waitFor();
          await expect(page.locator(".task-editor-content > .dialog-body")).toBeHidden();
          const box = await page.locator(".task-comments-panel").boundingBox();
          expect(box.width, JSON.stringify(box)).toBeGreaterThanOrEqual(width - 30);
          if (process.env.AUDIT_OUTPUT) await page.screenshot({ path: path.join(process.env.AUDIT_OUTPUT, `${width}-comments.png`) });
          await page.locator('[data-editor-pane="details"]').click();
          await expect(page.locator(".task-editor-content > .dialog-body")).toBeVisible();
          await page.locator('[data-editor-pane="history"]').click();
          await page.locator(".task-history-panel").waitFor();
          await page.locator('[data-editor-pane="details"]').click();
          await page.locator('[data-action="dialog-close"]').click();
        });
    });
});

test.describe("production build", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });
  test("a cold start on a slow connection transfers under 900KB", async ({ page, browserName }, testInfo) => {
    test.skip(process.env.PRODUCTION_ASSETS !== "1", "Set PRODUCTION_ASSETS=1 to check the production build in dist/");
    test.skip(browserName !== "chromium", "Network and CPU throttling use the Chromium DevTools protocol");
    // The server serves the build when NODE_ENV is production at creation time.
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const production = await startApp("audit-production").finally(() => {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    });
    try {
      Object.assign(production, await seed(production.store));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const start = Date.now();
      await openView(page, "list", production);
      const elapsed = Date.now() - start;
      const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((r) => ({ url: r.name, bytes: r.encodedBodySize })));
      const bytes = resources.reduce((n, r) => n + r.bytes, 0);
      await testInfo.attach("production-cold.json", { body: JSON.stringify({ readyMs: elapsed, requests: resources.length, bytes, resources }, null, 2), contentType: "application/json" });
      expect(bytes, "Cold transfer exceeds 900KB").toBeLessThan(900000);
    } finally {
      await page.close();
      await production.close();
    }
  });
});
