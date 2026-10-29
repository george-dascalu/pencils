// Project frames on the board: the frame is drawn by dragging (Escape cancels), lands exactly
// where it was drawn, and "Update plan" lays the project's cards and dependency arrows inside it.
// None of this moves the camera. The frame title is read-only, dragging the frame carries its
// contents, later tasks join on update and undo removes them, and rearranging puts a prerequisite
// to the left of its dependent (the reported pair where the dependent comes first in task order).
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Project frame lab" });
  const parent = await store.createTask(project.id, { title: "Design", type: "epic" });
  const child = await store.createTask(project.id, { title: "Build", parent: parent.id, dependencies: [parent.id] });
  return { project, parent, child };
});
// One frame is drawn, updated, moved and rearranged across these steps.
test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1500, height: 1000 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
let frame;
const frameElement = (page) => page.locator(`[data-node="${frame.id}"]`);

async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  if (frame) await frameElement(page).waitFor();
}
// Board saves can replace the world element during a read. Wait for the current element's
// transform rather than sampling a detached node.
async function camera(page) {
  const value = await page.waitForFunction(() => {
    const world = document.querySelector("#canvas-world");
    if (!world) return false;
    const transform = getComputedStyle(world).transform;
    return transform && transform !== "none" ? transform : false;
  });
  return value.jsonValue();
}
async function updatePlan(page, { relayout = false } = {}) {
  await frameElement(page).getByRole("button", { name: "Update plan", exact: true }).click();
  if (relayout) await page.locator("#frame-relayout").check();
  await page.locator("#frame-apply").click();
}
const savedAutomatically = (page) => expect(page.locator("#board-save")).toHaveText("Saved automatically");

test("a project frame is drawn by dragging, Escape cancels, and it lands where drawn without moving the camera", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  const originalCamera = await camera(page);
  const canvas = await page.locator("#canvas").boundingBox();
  const start = { x: canvas.x + 150, y: canvas.y + 90 };
  const draw = async () => {
    const tool = page.getByRole("button", { name: "Add Project frame", exact: true });
    if (!(await tool.evaluate((el) => el.classList.contains("active")))) await tool.click();
    expect((await current()).nodes, "Choosing the tool does not create a frame").toHaveLength(0);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 550, start.y + 480, { steps: 8 });
    await page.locator(".frame-preview").waitFor();
  };
  await draw();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".frame-preview")).toHaveCount(0);
  expect((await current()).nodes, "Escape cancels drawing").toHaveLength(0);
  await draw();
  await page.mouse.up();
  await expect.poll(async () => (await current()).nodes.some((n) => n.projectFrame)).toBe(true);
  const board = await current();
  frame = board.nodes.find((n) => n.projectFrame);
  expect(board.nodes, "Place an empty frame before updating its plan").toHaveLength(1);
  expect(await camera(page), "Placement keeps the camera").toBe(originalCamera);
  const placed = await frameElement(page).boundingBox();
  expect(Math.abs(placed.x - start.x), "Frame starts where drawn").toBeLessThan(2);
  expect(Math.abs(placed.y - start.y), "Frame starts where drawn").toBeLessThan(2);
  expect(Math.abs(placed.width - 550), "Frame uses drawn size").toBeLessThan(2);
  expect(Math.abs(placed.height - 480), "Frame uses drawn size").toBeLessThan(2);
});

test("Update plan lays out the project's cards and arrows without moving the camera, and repeating it keeps the same cards", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  const originalCamera = await camera(page);
  await frameElement(page).locator(".project-frame-update").click();
  await page.locator("#frame-apply").click();
  await expect.poll(async () => (await current()).nodes.filter((n) => n.type === "task").length).toBe(2);
  expect(await camera(page), "Updating the plan keeps the camera").toBe(originalCamera);
  const board = await current();
  expect(board.edges).toHaveLength(2);
  // The frame title is read-only: double-clicking it opens no inline editor.
  await frameElement(page).locator(".frame-title").dblclick({ force: true });
  await expect(page.locator("#canvas-inline-form")).toHaveCount(0);
  const cardIds = board.nodes.map((n) => n.id);
  await updatePlan(page);
  await page.locator("#frame-apply").waitFor({ state: "detached" });
  await savedAutomatically(page);
  expect((await current()).nodes.map((n) => n.id)).toEqual(cardIds);
});

test("dragging the frame by its title moves its contents with it, keeping the camera", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  const originalCamera = await camera(page);
  const beforeMove = structuredClone((await current()).nodes);
  const title = frameElement(page).locator(".frame-title");
  await title.waitFor();
  const box = await title.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 59, box.y + 44, { steps: 8 });
  await page.mouse.up();
  const oldFrame = beforeMove.find((n) => n.id === frame.id);
  await expect.poll(async () => (await current()).nodes.find((n) => n.id === frame.id).x).not.toBe(oldFrame.x);
  const afterMove = (await current()).nodes;
  const movedFrame = afterMove.find((n) => n.id === frame.id);
  for (const node of afterMove) {
    const previous = beforeMove.find((n) => n.id === node.id);
    expect(Math.abs(node.x - previous.x - (movedFrame.x - oldFrame.x)), `${node.id} moves with the frame`).toBeLessThanOrEqual(1);
    expect(Math.abs(node.y - previous.y - (movedFrame.y - oldFrame.y)), `${node.id} moves with the frame`).toBeLessThanOrEqual(1);
  }
  expect(await camera(page), "Dragging keeps the camera").toBe(originalCamera);
});

test("a task added later joins the frame on update, undo removes it, and the arrows survive a reload", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  app.third = await app.store.createTask(app.project.id, { title: "Ship", dependencies: [app.child.id] });
  await updatePlan(page);
  await expect.poll(async () => (await current()).nodes.some((n) => n.task === app.third.id)).toBe(true);
  await savedAutomatically(page);
  await page.locator("[data-action=board-undo]").click();
  await expect.poll(async () => (await current()).nodes.some((n) => n.task === app.third.id)).toBe(false);
  await page.reload();
  await frameElement(page).waitFor();
  expect((await current()).edges).toHaveLength(2);
});

test("rearranging puts a prerequisite to the left of its dependent, keeping the camera", { tag: "@gate" }, async ({ page }) => {
  const { store, project, parent, child, third } = app;
  await openBoard(page);
  const originalCamera = await camera(page);
  // Reproduce the reported pair: the dependent appears first in task order. As in the
  // original suite, the tasks change while the board is open and the update follows at once.
  let snapshot = await store.snapshot(project.id);
  await store.updateTask(project.id, third.id, { revision: snapshot.tasks.find((t) => t.id === third.id).revision, archived: true });
  await store.updateTask(project.id, child.id, { revision: snapshot.tasks.find((t) => t.id === child.id).revision, parent: null, dependencies: [] });
  snapshot = await store.snapshot(project.id);
  await store.updateTask(project.id, parent.id, { revision: snapshot.tasks.find((t) => t.id === parent.id).revision, dependencies: [child.id] });
  await updatePlan(page, { relayout: true });
  await expect.poll(async () => {
    const b = await current();
    const a = b.nodes.find((n) => n.task === child.id);
    const target = b.nodes.find((n) => n.task === parent.id);
    return Boolean(a && target && a.y === target.y && a.x + a.w < target.x);
  }).toBe(true);
  const updated = await current();
  const prerequisite = updated.nodes.find((n) => n.task === child.id);
  const dependent = updated.nodes.find((n) => n.task === parent.id);
  await expect.poll(async () => {
    const [a, b] = [await page.locator(`[data-node="${prerequisite.id}"]`).boundingBox(), await page.locator(`[data-node="${dependent.id}"]`).boundingBox()];
    return { aligned: Math.abs(a.y - b.y) < 1, prerequisiteLeft: a.x + a.width < b.x };
  }, { message: "Rendered dependency cards align, prerequisite on the left" }).toEqual({ aligned: true, prerequisiteLeft: true });
  expect(await camera(page), "Rearranging dependencies keeps the camera").toBe(originalCamera);
});

test("the board has no horizontal overflow in the dark theme at desktop and phone widths", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth), { message: `no overflow at ${width}px` }).toBe(false);
  }
});

// The server may list the same tasks in another order between the preview and the apply
// (its short-lived cache expired). Only a real change in the tasks should stop the update.
test("Update plan applies when the server lists the same tasks in another order", async ({ page }) => {
  await openBoard(page);
  await frameElement(page).getByRole("button", { name: "Update plan", exact: true }).click();
  await page.locator("#frame-apply").waitFor();
  await page.route(`**/api/projects/${app.project.id}`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.tasks.reverse();
    await route.fulfill({ response, json: body });
  });
  await page.locator("#frame-apply").click();
  await expect(page.locator("#frame-apply")).toBeHidden();
  await savedAutomatically(page);
});
