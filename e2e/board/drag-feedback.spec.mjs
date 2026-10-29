// Drag feedback: dragging a note from the board tools shows a drop preview and saves one note
// where the preview was, even when zoomed; outside drops and Escape cancel. Whole Kanban cards
// open the shared task editor (click, metadata, Enter, phone), and dragging a card shows an
// insertion slot, reorders, moves across columns, scrolls toward offscreen columns and can be
// cancelled, without opening the card. No request leaves the app.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, { title: "Write specification", assignee: "Alice", due: "2020-01-01", body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n" });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  await store.createTask(project.id, { title: "Review prototype" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
      { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
      { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
      { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
    ],
    edges: [],
  });
  return { project };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

let external;
test.beforeEach(async ({ page }) => {
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no external requests").toEqual([]));

test.describe("dragging a note from the board tools", () => {
  const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
  const sticky = (page) => page.locator(".board-tools [data-tool=sticky]");
  // Opens the board zoomed out one wheel step and returns the drop point.
  async function openZoomed(page) {
    await page.goto(`${app.base}/#project/${app.project.id}/board`);
    await page.locator('[data-node="note"]').waitFor();
    const rect = await page.locator("#canvas").boundingBox();
    const camera = await page.locator("#canvas-world").getAttribute("style");
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.wheel(0, 200);
    await expect(page.locator("#canvas-world")).not.toHaveAttribute("style", camera);
    await expect(page.locator("#canvas")).not.toHaveClass(/zooming/);
    return { x: rect.x + rect.width * 0.65, y: rect.y + rect.height * 0.6 };
  }
  async function pickUp(page) {
    const source = await sticky(page).boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
  }

  test("shows a preview and drops one note where the preview was, at any zoom", async ({ page }) => {
    const { x, y } = await openZoomed(page);
    const startCount = (await current()).nodes.length;
    await pickUp(page);
    await page.mouse.move(x, y, { steps: 12 });
    await page.locator(".sticky-drop-preview").waitFor();
    expect((await current()).nodes.length, "no file change before the drop").toBe(startCount);
    const preview = await page.locator(".sticky-drop-preview").boundingBox();
    expect(preview.x < x && preview.x + preview.width > x).toBe(true);
    expect(preview.y < y && preview.y + preview.height > y).toBe(true);
    await page.mouse.up();
    await page.locator("#canvas-inline-form .inline-rich").fill("Dragged sticky");
    await page.locator('[data-pro="search-toggle"]').click();
    await expect.poll(async () => (await current()).nodes.some((n) => n.text === "Dragged sticky")).toBe(true);
    expect((await current()).nodes.length).toBe(startCount + 1);
    const note = (await current()).nodes.find((n) => n.text === "Dragged sticky");
    const placed = await page.locator(`[data-node="${note.id}"]`).boundingBox();
    expect(Math.abs(placed.x - preview.x) < 3 && Math.abs(placed.y - preview.y) < 3, "the dropped note matches its preview after zooming").toBe(true);
    await expect(page.locator(".sticky-drop-preview")).toHaveCount(0);
  });

  test("dropping outside the board or pressing Escape leaves the board untouched", async ({ page }) => {
    const { x, y } = await openZoomed(page);
    const startCount = (await current()).nodes.length;
    for (const cancel of ["outside", "escape"]) {
      await pickUp(page);
      await page.mouse.move(x, y, { steps: 6 });
      if (cancel === "outside") await page.mouse.move(10, 10, { steps: 5 });
      else await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(page.locator(".sticky-drop-preview"), cancel).toHaveCount(0);
      expect((await current()).nodes.length, cancel).toBe(startCount);
    }
  });
});

test.describe("Kanban cards", () => {
  // Each test gets its own project, so ordering and status changes do not carry over.
  let seeded = 0;
  async function seedKanban(page, orders = {}) {
    const { store } = app;
    const project = await store.createProject({ title: `Kanban lab ${++seeded}` });
    const tasks = {
      a: await store.createTask(project.id, { title: "Write specification", assignee: "Alice", due: "2020-01-01", body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n" }),
      b: await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" }),
      c: await store.createTask(project.id, { title: "Review prototype" }),
    };
    for (const [key, order] of Object.entries(orders)) tasks[key] = await store.updateTask(project.id, tasks[key].id, { revision: tasks[key].revision, order });
    await page.goto(`${app.base}/#project/${project.id}/kanban`);
    await page.locator(`[data-drag-task="${tasks.a.id}"]`).waitFor();
    const order = async (key) => ((await store.snapshot(project.id)).tasks.find((t) => t.id === tasks[key].id).order || 0);
    const task = async (key) => (await store.snapshot(project.id)).tasks.find((t) => t.id === tasks[key].id);
    return { project, tasks, order, task, card: (key) => page.locator(`[data-drag-task="${tasks[key].id}"]`) };
  }
  async function checkTaskEditor(page, a) {
    await page.locator("#task-form").waitFor();
    await expect(page.locator("#task-form")).toHaveAttribute("data-id", a.id);
    await expect(page.locator('#task-form [name="title"]')).toHaveValue(a.title);
    await expect(page.getByRole("textbox", { name: "Task description", exact: true })).toBeVisible();
    await expect(page.locator('#task-form [name="status"]')).toBeVisible();
    await expect(page.locator('[data-task-picker="priority"]')).toBeVisible();
    await page.locator('[data-action="dialog-close"]').click();
    await page.locator("dialog").waitFor({ state: "detached" });
  }
  async function lift(page, card) {
    const from = await card.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + 20);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + 40, { steps: 5 });
  }

  test("a click anywhere on a card, or Enter on its title, opens the shared task editor", async ({ page }) => {
    const { tasks, card } = await seedKanban(page);
    await card("a").click({ position: { x: 5, y: 5 } });
    await checkTaskEditor(page, tasks.a);
    // Kanban cards hide IDs by default (0.18.24) and show only assignee and
    // priority below the title, so click the metadata the card renders.
    for (const target of [".task-type", ".card-bottom .kanban-assignee", ".card-bottom .priority", ".task-title"]) {
      await card("a").locator(target).click();
      await checkTaskEditor(page, tasks.a);
    }
    await card("a").locator(".task-title").focus();
    await page.keyboard.press("Enter");
    await checkTaskEditor(page, tasks.a);
  });

  test("dragging a card shows an insertion slot above the target and reorders without opening the card", async ({ page }) => {
    const { tasks, card, order } = await seedKanban(page);
    const to = await card("a").boundingBox();
    await lift(page, card("b"));
    await page.mouse.move(to.x + to.width / 2, to.y + 8, { steps: 8 });
    await page.locator(".kanban-drop-placeholder").waitFor();
    // Chromium delivers dragover for only some synthetic moves, so the last one
    // can trail the pointer; with the shorter 0.19.x Kanban cards it lands just
    // past the target's midpoint. Keep hovering at the target, as a real pointer
    // would, until a dragover registers.
    let i = 0;
    await expect.poll(async () => {
      await page.mouse.move(to.x + to.width / 2, to.y + 10 + (i++ % 2));
      return page.locator(".kanban-drop-placeholder").evaluate((el) => el.nextElementSibling?.dataset.dragTask);
    }, { message: "the slot sits before the target card" }).toBe(tasks.a.id);
    await expect(page.locator("#task-form"), "dragging does not open the card").toHaveCount(0);
    await expect.poll(async () => {
      const slot = await page.locator(".kanban-drop-placeholder").boundingBox();
      const next = await card("a").boundingBox();
      return slot.y + slot.height <= next.y + 2;
    }, { message: "the insertion slot reserves space above the next card" }).toBe(true);
    await page.mouse.up();
    await expect.poll(async () => (await order("b")) < (await order("a"))).toBe(true);
    await expect(page.locator(".kanban-drop-placeholder")).toHaveCount(0);
    await expect(page.locator("#task-form"), "dropping does not open the card").toHaveCount(0);
  });

  test("a card dropped between two others keeps both neighbours in order", async ({ page }) => {
    // B already sits above A, as after the reorder above.
    const { card, order } = await seedKanban(page, { b: 1000, a: 2000, c: 3000 });
    await card("c").dragTo(card("a"), { targetPosition: { x: 80, y: 8 } });
    await expect.poll(async () => (await order("b")) < (await order("c")) && (await order("c")) < (await order("a")), { message: "middle insertion preserves both neighbours" }).toBe(true);
  });

  test("a card dropped on another column takes its status, which persists", async ({ page }) => {
    const { card, task } = await seedKanban(page);
    await card("b").dragTo(page.locator("[data-drop-status=done]"));
    await expect.poll(async () => (await task("b")).status).toBe("done");
    await page.reload();
    await card("b").waitFor();
    expect(await card("b").evaluate((el) => el.closest("[data-drop-status]").dataset.dropStatus)).toBe("done");
  });

  test.describe("on a narrower screen", () => {
    test.use({ viewportSize: { width: 1000, height: 900 } });
    test("hovering at the right edge scrolls toward offscreen columns, and Escape cancels the drag", async ({ page }) => {
      const { card, task } = await seedKanban(page);
      await page.locator(".kanban").evaluate((el) => (el.scrollLeft = 0));
      const boardRect = await page.locator(".kanban").boundingBox();
      await lift(page, card("a"));
      await page.mouse.move(boardRect.x + boardRect.width - 8, boardRect.y + 100, { steps: 12 });
      await page.waitForFunction(() => document.querySelector(".kanban").scrollLeft > 20);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(page.locator(".kanban-drop-placeholder")).toHaveCount(0);
      expect((await task("a")).status).toBe("todo");
      await expect(page.locator("#task-form"), "cancelling a drag does not open the card").toHaveCount(0);
    });
  });

  onDevices(["phone"], () => {
    test.use({ viewportSize: null });
    test("a tap on a card opens the shared task editor", async ({ page }) => {
      const { tasks, card } = await seedKanban(page);
      await card("a").click({ position: { x: 5, y: 5 } });
      await checkTaskEditor(page, tasks.a);
    });
  });
});
