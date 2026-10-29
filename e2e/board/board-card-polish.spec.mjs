// Owner requests, 28 October 2026 (board):
// - relationship arrows read from start to end ("parent of", "child of"), and
//   arrows of one kind fanning out from one card share a single label;
// - long titles on board task cards end in an ellipsis instead of being cut;
// - the comment composer's send button sits to the right of the text box, as
//   tall as the box and slim.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board polish", key: "BP" });
  const make = (title, extra = {}) => store.createTask(project.id, { title, status: "todo", ...extra });
  const P = await make("Plan the launch");
  const C1 = await make("Collect inspiration and early references for the dashboard redesign project", { parent: P.id });
  const C2 = await make("Sketch the project dashboard", { parent: P.id });
  const C3 = await make("Map the first user journey", { parent: P.id });
  const C4 = await make("Keep the big picture close", { parent: C1.id });
  const Q = await make("Release notes");
  const R = await make("Draft the changelog", { parent: Q.id });
  const board = (await store.snapshot(project.id)).boards[0];
  const card = (id, task, x, y) => ({ id, type: "task", task: task.id, x, y, w: 300, h: 130, taskCollapsed: true });
  const parentEdge = (id, from, to, extra = {}) => ({ id, from, to, fromSide: "bottom", toSide: "left", routing: "elbow", fromEnd: "none", toEnd: "arrow", color: "#78906f", width: 2, lineStyle: "solid", label: "parent / child", planRelation: "parent", ...extra });
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [card("p", P, 60, 40), card("c1", C1, 160, 230), card("c2", C2, 160, 420), card("c3", C3, 160, 610), card("c4", C4, 560, 380), card("q", Q, 900, 40), card("r", R, 960, 300)],
    edges: [
      parentEdge("e-p-c3", "p", "c3"), parentEdge("e-p-c1", "p", "c1"), parentEdge("e-p-c2", "p", "c2"),
      parentEdge("e-c1-c4", "c1", "c4"),
      // Drawn from the child to its parent, so it reads "child of".
      parentEdge("e-r-q", "r", "q", { fromSide: "top", toSide: "bottom" }),
    ],
  });
  return { project, board, C1, C2, C3 };
});

async function open(page) {
  await page.addInitScript((id) => {
    localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 20, y: 20, z: 0.7 }));
  }, app.board.id);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator('[data-node="c1"] .live-card-heading .task-title').waitFor();
  await page.locator('#canvas .edge-label[data-edge="e-p-c1"][data-edge-label="main"]').waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
}

// Main label text of each visible arrow, without the tooltip's <title> text.
const edgeLabels = (page) => page.locator('#canvas .edge-label[data-edge-label="main"]').evaluateAll((els) => els.map((el) => ({
  edge: el.dataset.edge,
  text: [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.nodeValue).join("").trim(),
  tooltip: el.querySelector("title")?.textContent || "",
})));

test("relationship arrows read from start to end", async ({ page }) => {
  await open(page);
  const labels = await edgeLabels(page);
  expect(labels.some((l) => /parent \/ child/.test(l.text)), `no "parent / child" text ${JSON.stringify(labels)}`).toBe(false);
  expect(labels.filter((l) => l.edge === "e-c1-c4").map((l) => l.text), "a single parent arrow").toEqual(["parent of"]);
  expect(labels.filter((l) => l.edge === "e-r-q").map((l) => l.text), "an arrow drawn from the child").toEqual(["child of"]);
});

onDevices(["desktop", "phone"], () => {
  test("no relationship label has its own line running through the words", async ({ page }) => {
    await open(page);
    const crossings = await page.evaluate(() => [...document.querySelectorAll('#canvas .edge-label[data-edge-label="main"]')].flatMap((label) => {
      const path = document.querySelector(`#canvas path.canvas-edge[data-edge="${label.dataset.edge}"]`);
      if (!path) return [];
      const box = label.getBBox(), points = [...path.getAttribute("d").matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
      const hits = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (Math.abs(a.x - b.x) > 0.5) continue; // vertical stretches only
        const inside = a.x > box.x + 1 && a.x < box.x + box.width - 1 && Math.min(a.y, b.y) < box.y + box.height && Math.max(a.y, b.y) > box.y;
        if (inside) hits.push({ edge: label.dataset.edge, x: a.x, box: [box.x, box.y, box.width, box.height] });
      }
      return hits;
    }));
    expect(crossings).toEqual([]);
  });

  test("arrows fanning out from one card share one label", async ({ page }) => {
    await open(page);
    // Phones open boards at the remembered camera too; make sure the parent is in view.
    await page.locator('[data-node="p"]').waitFor();
    const labels = (await edgeLabels(page)).filter((l) => l.edge.startsWith("e-p-"));
    expect(labels, `one label for the three children ${JSON.stringify(labels)}`).toHaveLength(1);
    expect(labels[0].text).toBe("parent of");
    expect(labels[0].edge, "the label belongs to the first arrow, so it does not move between renders").toBe("e-p-c1");
    for (const task of [app.C1, app.C2, app.C3]) expect(labels[0].tooltip, "the tooltip names every child").toMatch(new RegExp(task.key));
    // The label sits on the shared trunk, clear of the cards.
    const box = await page.locator('#canvas .edge-label[data-edge="e-p-c1"][data-edge-label="main"]').boundingBox();
    for (const node of ["p", "c1", "c2", "c3"]) {
      const n = await page.locator(`[data-node="${node}"]`).boundingBox();
      if (!n) continue; // Cards outside the phone's view are not drawn.
      const overlap = box.x < n.x + n.width && box.x + box.width > n.x && box.y < n.y + n.height && box.y + box.height > n.y;
      expect(overlap, `label clear of card ${node}: ${JSON.stringify({ box, n })}`).toBe(false);
    }
  });
});

onDevices(["desktop", "ipad", "phone"], () => {
  test("long card titles end in an ellipsis", async ({ page }) => {
    await open(page);
    const title = page.locator('[data-node="c1"] .live-card-heading .task-title');
    const style = await title.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { display: cs.display, lineClamp: cs.webkitLineClamp, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, overflow: cs.overflowX, truncated: el.scrollWidth > el.clientWidth + 1, title: el.title };
    });
    // Safari keeps a 3-line clamp box for single-line text and clips it without an
    // ellipsis (Chromium reports that box as flow-root and draws one anyway).
    expect({ display: style.display, lineClamp: style.lineClamp }, `a plain one-line block ${JSON.stringify(style)}`).toEqual({ display: "block", lineClamp: "none" });
    expect({ textOverflow: style.textOverflow, whiteSpace: style.whiteSpace, overflow: style.overflow }).toEqual({ textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" });
    expect(style.truncated, "the long title is truncated").toBe(true);
    expect(style.title, "the full title stays in the tooltip").toBe(app.C1.title);
  });

  test("the comment send button sits right of the text box, tall and slim, and is named for its mode", async ({ page, device }) => {
    await open(page);
    await page.locator('[data-node="c2"] [data-pro="comments"]').click();
    const submit = page.locator("#board-comment-form [data-comment-submit]");
    // Wait until the panel has stopped moving before measuring it.
    await submit.click({ trial: true });
    const c = await page.locator("#board-comment-form").evaluate((form) => {
      const visible = [...form.querySelectorAll(".inline-rich, textarea, .inline-preview")].find((el) => el.getClientRects().length);
      const button = form.querySelector("[data-comment-submit]");
      const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      return { input: box(visible), button: box(button), name: button.getAttribute("aria-label") || button.textContent.trim(), text: button.textContent.trim() };
    });
    expect(c.button.left, `button right of the text box ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(c.input.right);
    expect(Math.abs(c.button.top - c.input.top) <= 2 && Math.abs(c.button.bottom - c.input.bottom) <= 2, `button as tall as the text box ${JSON.stringify(c)}`).toBe(true);
    const width = device === "desktop" ? 32 : 44;
    expect(Math.abs(c.button.width - width), `button is ${width}px wide ${JSON.stringify(c.button)}`).toBeLessThanOrEqual(1);
    // 44px touch targets beside an 80px text box still read as a slim column.
    expect(c.button.height, `tall and slim ${JSON.stringify(c.button)}`).toBeGreaterThanOrEqual(1.75 * c.button.width);
    expect(c.name).toBe("Add comment");
    expect(c.text, "the button shows an icon, named for assistive tech").toBe("");
    const viewport = page.viewportSize();
    const panel = await page.locator(".board-comments").boundingBox();
    expect(c.button.right <= panel.x + panel.width && c.button.right <= viewport.width, "button stays inside the panel").toBe(true);
    // Send a comment, then reply to it: the button's name follows the mode.
    await page.locator("#board-comment-form .inline-rich").click();
    await page.keyboard.type("Looks good");
    await submit.click();
    await page.locator(".board-comment").filter({ hasText: "Looks good" }).first().waitFor();
    await page.locator(".board-comment [data-comment-reply]").first().click();
    await expect(submit).toHaveAttribute("aria-label", "Send reply");
  });
});

test("card editor comments use the same composer", async ({ page }) => {
  await open(page);
  await page.locator('[data-node="c2"] [data-pro="task-details"]').click();
  await page.locator("#task-form").waitFor();
  await page.getByRole("button", { name: "Task comments", exact: true }).click();
  const form = page.locator(".task-comments-panel #board-comment-form");
  await form.locator("[data-comment-submit]").click({ trial: true });
  const c = await form.evaluate((form) => {
    const input = form.querySelector(".inline-rich").getBoundingClientRect(), button = form.querySelector("[data-comment-submit]").getBoundingClientRect();
    return { inputRight: input.right, inputTop: input.top, inputBottom: input.bottom, left: button.left, top: button.top, bottom: button.bottom, width: button.width };
  });
  expect(c.left >= c.inputRight && Math.abs(c.top - c.inputTop) <= 2 && Math.abs(c.bottom - c.inputBottom) <= 2 && Math.abs(c.width - 32) <= 1, JSON.stringify(c)).toBe(true);
});
