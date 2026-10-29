// Workflow review: the keyboard connector creates a real task dependency between board cards,
// anchored right-to-left; a card whose task no longer exists can be detached into a note; and an
// automation rule is previewed and applied from Project settings.
import { test, expect, useApp } from "../fixtures.mjs";
import { clickControl, selectSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Review workflows" });
  const a = await store.createTask(project.id, { title: "First task" });
  const b = await store.createTask(project.id, { title: "Second task" });
  const original = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, original.id, {
    revision: original.revision,
    nodes: [a, b]
      .map((t, i) => ({ id: `node-${i}`, type: "task", task: t.id, x: 140 + i * 390, y: 150, w: 340, h: 240 }))
      .concat([{ id: "missing", type: "task", task: "t-missing", x: 140, y: 440, w: 340, h: 240 }]),
    edges: [],
  });
  return { project, a, b };
});
test.use({ viewportSize: { width: 1440, height: 1050 } });
const snapshot = () => app.store.snapshot(app.project.id);

async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="node-0"]').waitFor();
}

test("the keyboard connector makes one card block another, anchored right to left", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await clickControl(page.locator('[data-pro="connections"]'));
  await page.locator('#keyboard-connector [name="from"]').selectOption("node-0");
  await page.locator('#keyboard-connector [name="to"]').selectOption("node-1");
  await page.locator('#keyboard-connector [name="relationship"]').selectOption("blocks");
  await page.locator('#keyboard-connector [name="label"]').fill("Ready before");
  await page.locator('#keyboard-connector button[type="submit"]').click();
  await page.locator("#keyboard-connector").waitFor({ state: "detached" });
  const s = await snapshot();
  expect(s.tasks.find((t) => t.id === app.b.id).dependencies).toEqual([app.a.id]);
  expect(s.boards[0].edges[0].fromSide).toBe("right");
  expect(s.boards[0].edges[0].toSide).toBe("left");
});

test("a card whose task is missing can be detached into a note", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await page.locator('[data-pro="task-detach"]').click();
  await expect.poll(async () => (await snapshot()).boards[0].nodes.find((n) => n.id === "missing").type).toBe("sticky");
});

test("an automation rule is previewed and applied from Project settings", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await page.locator('.top-actions [data-action="project-edit"]').click();
  await selectSettingsPage(page, "automation");
  await page.locator('[data-automation="add"]').click();
  await page.locator('#automation-form [name="name"]').fill("Set important");
  await page.locator('#automation-form [name="value"]').selectOption("high");
  await page.locator('#automation-form button[type="submit"]').click();
  await page.locator('[data-automation="toggle"]').click();
  await page.locator('[data-automation="preview"]').click();
  await page.locator("#automation-apply").click();
  await page.locator("#automation-apply").waitFor({ state: "detached" });
  await page.locator('[data-automation="preview"]').waitFor();
  const tasks = (await snapshot()).tasks;
  expect(tasks.filter((t) => t.priority !== "high")).toEqual([]);
});
