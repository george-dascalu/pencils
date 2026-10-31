// Drawing on boards: the old Drawing view is folded into Board. Legacy Drawing defaults and
// stored preferences open Board, every board takes pencil strokes and can link tasks, the
// Boards gallery lists legacy drawings with device checkpoints, and offline drawing keeps
// working on the offline pad after a reload with the server gone. Pending offline edits guard
// Board, the canvas selector and direct links until they are synced or restored as a copy.
// Part of the cross-browser release gate (desktop tests run in Firefox and WebKit too).
import net from "node:net";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { makeStroke } from "../../public/pen-model.js";

const app = useApp();
const gate = { tag: "@gate" };

// A project with a legacy Drawing board, the default board, and "Pencil sketch" holding a
// stroke, a note and a linked task.
async function seedProject({ defaultView } = {}) {
  const { store } = app;
  let project = await store.createProject({ title: "Drawing tests" });
  const legacy = await store.createBoard(project.id, { title: "Existing drawing" });
  await store.updateBoard(project.id, legacy.id, { revision: legacy.revision, settings: { drawing: true } });
  const linkedTask = await store.createTask(project.id, { title: "Linked task" });
  if (defaultView) project = await store.updateProject(project.id, { revision: project.revision, default_view: defaultView });
  const created = await store.createBoard(project.id, { title: "Pencil sketch" });
  const stroke = makeStroke([220, 260, 300, 360].map((x, i) => ({ x, y: 200 + i * 25, pressure: 0.5, time: i * 10 })), { color: "#263c34", strokeWidth: 3, pressure: true }, "seed-stroke");
  const note = { id: "offline-note", type: "sticky", x: 600, y: 100, w: 200, h: 200, text: "Keep this note" };
  const sketch = await store.updateBoard(project.id, created.id, { revision: created.revision, nodes: [stroke, note], settings: { linked_tasks: [linkedTask.id] } });
  return { project, legacy, linkedTask, sketch, note };
}
const boards = async (project) => (await app.store.snapshot(project.id)).boards;
const boardNamed = async (project, title) => (await boards(project)).find((b) => b.title === title);
const draws = (board) => board.nodes.filter((n) => n.type === "draw");
const boardMenu = (page) => page.locator('[data-board-menu="board"] summary');
// Board tools (⋯) holds Link tasks, Copy board link and the offline pad (0.20.71).
const toolsMenu = (page) => page.locator('[data-board-menu="tools"] summary');
const activeTab = (page) => page.locator('.tabs [aria-current="page"]');
const pendingGuard = (page) => page.locator('[data-drawing-action="sync"]');

// A proxy in front of the server, so the test can take the origin away during the offline
// phase. (WebKit's setOffline(true) rejects even service-worker responses:
// microsoft/playwright#42775.)
async function startGateway() {
  const upstreamPort = Number(new URL(app.base).port);
  const connections = new Set();
  const gateway = net.createServer((socket) => {
    const upstream = net.connect(upstreamPort, "127.0.0.1");
    for (const connection of [socket, upstream]) {
      connections.add(connection);
      connection.on("close", () => connections.delete(connection));
      connection.on("error", () => {
        socket.destroy();
        upstream.destroy();
      });
    }
    socket.pipe(upstream).pipe(socket);
  });
  await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const port = gateway.address().port;
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      for (const socket of connections) socket.destroy();
      if (gateway.listening) await new Promise((resolve) => gateway.close(resolve));
    },
    restart: () => new Promise((resolve) => gateway.listen(port, "127.0.0.1", resolve)),
  };
}
async function drawStroke(page, from, to, steps) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

test("legacy Drawing defaults and stored view preferences open Board, which has no Drawing view", gate, async ({ page }) => {
  const { project } = await seedProject({ defaultView: "drawing" });
  await page.goto(`${app.base}/#project/${project.id}`);
  await expect(activeTab(page), "a legacy default Drawing opens Board").toHaveAttribute("data-view", "board");
  await expect(page.locator('.tabs [data-view="drawing"]')).toHaveCount(0);
  await expect(page.locator('#project-view-switcher option[value="drawing"]')).toHaveCount(0);
  await page.locator("#canvas").waitFor();
  // Stored legacy view preferences are aliases too.
  await page.evaluate((id) => localStorage.setItem(`pencils:view:${id}`, JSON.stringify("drawing")), project.id);
  await page.reload();
  await page.locator("#canvas").waitFor();
  await expect(activeTab(page)).toHaveAttribute("data-view", "board");
});

test("a pencil stroke on a new board saves to the server and this device, and the board links tasks", gate, async ({ page }) => {
  const { project, linkedTask } = await seedProject();
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await page.locator("#canvas").waitFor();
  await boardMenu(page).click();
  await page.locator('[data-action="board-new"]').click();
  await page.locator('#board-form [name="title"]').fill("Fresh sketch");
  await page.locator('#board-form .dialog-foot button[type="submit"]').click();
  await page.locator("#canvas").waitFor();
  await page.locator('.board-tools [data-feature="draw-tool"]').click();
  const rect = await page.locator("#canvas").boundingBox();
  await drawStroke(page, { x: rect.x + 220, y: rect.y + 200 }, { x: rect.x + 360, y: rect.y + 280 }, 12);
  await expect(page.locator("[data-drawing-save]")).toContainText("server");
  await expect.poll(async () => draws((await boardNamed(project, "Fresh sketch")) || { nodes: [] }).length).toBe(1);
  expect((await boardNamed(project, "Fresh sketch")).settings?.drawing, "ordinary boards receive all drawing tools").toBeFalsy();
  // Normal boards can be linked to tasks, not only old Drawing canvases.
  await toolsMenu(page).click();
  await page.locator('[data-drawing-action="link-task"]').click();
  await page.locator(`#drawing-links [value="${linkedTask.id}"]`).check();
  await page.locator("#drawing-links .dialog-foot button").click();
  await expect(page.locator("[data-drawing-save]")).toHaveText("Saved on this device and server");
  expect((await boardNamed(project, "Fresh sketch")).settings.linked_tasks).toEqual([linkedTask.id]);
});

test("the Boards gallery lists every board, legacy drawings included, and the device checkpoints", gate, async ({ page }) => {
  const { project, legacy, sketch } = await seedProject();
  await page.goto(`${app.base}/#project/${project.id}/board/${sketch.id}`);
  await page.locator("#canvas").waitFor();
  await expect(page.locator("#board-select option")).toHaveCount(3);
  await boardMenu(page).click();
  await page.locator('[data-drawing-action="gallery"]').click();
  await expect(page.locator('[data-drawing-action="open"]')).toHaveCount(3);
  await expect(page.locator(`[data-drawing-action="open"][data-id="${legacy.id}"]`)).toBeVisible();
  await page.locator('[data-drawing-action="recover"]').click();
  await expect(page.getByText(/Pencil sketch/).last()).toBeVisible();
  await page.locator('[data-action="dialog-close"]').click();
});

test("offline drawing survives a reload without the server, and pending edits guard every way back to the board until synced", gate, async ({ page }) => {
  const { project, legacy, linkedTask, sketch, note } = await seedProject();
  const gateway = await startGateway();
  try {
    await page.goto(`${gateway.base}/#project/${project.id}/board/${sketch.id}`);
    await page.locator("#canvas").waitFor();
    await boardMenu(page).click();
    await page.locator('[data-drawing-action="gallery"]').click();
    await page.locator('[data-drawing-action="offline"]').click();
    await expect(page.getByText("Offline drawing is prepared.")).toBeVisible();
    await page.goto(`${gateway.base}/drawing-offline.html`);
    await page.locator(`[data-open$="/${sketch.id}"]`).click();
    await gateway.stop();
    expect(await page.evaluate(() => fetch("/api/health").then(() => true, () => false)), "the origin is unavailable; offline reload cannot use the server").toBe(false);
    const box = await page.locator("#offline-canvas").boundingBox();
    await drawStroke(page, { x: box.x + 130, y: box.y + 120 }, { x: box.x + 240, y: box.y + 180 }, 8);
    await expect(page.getByText("Saved on this device · pending server sync")).toBeVisible();
    await page.reload();
    await page.locator(`[data-open$="/${sketch.id}"]`).click();
    await expect(page.locator("#offline-content > g > g"), "both strokes come back from the device").toHaveCount(2);

    await gateway.restart();
    // Restoring Board from local preferences must guard pending edits too.
    await page.goto(gateway.base);
    await pendingGuard(page).waitFor();
    await expect(page.locator("#canvas")).toHaveCount(0);
    await page.locator('[data-action="dialog-close"]').click();
    await page.locator(`[data-drawing-action="open"][data-id="${legacy.id}"]`).click();
    await page.locator("#canvas").waitFor();
    await page.selectOption("#board-select", sketch.id);
    await pendingGuard(page).waitFor();
    await expect(page.locator("#canvas"), "the canvas selector protects pending offline work").toHaveCount(0);
    // Direct links, Board and legacy Drawing, followed inside the app and opened afresh. (While
    // guarding, the app moves the address to the gallery, so a reload would open the gallery.)
    for (const link of [`#project/${project.id}/board/${sketch.id}`, `#project/${project.id}/drawing/${sketch.id}`]) {
      await page.locator('[data-action="dialog-close"]').click();
      await page.goto(`${gateway.base}/${link}`);
      await pendingGuard(page).waitFor();
      await expect(page.locator("#canvas"), `${link} inside the app`).toHaveCount(0);
      await page.goto("about:blank");
      await page.goto(`${gateway.base}/${link}`);
      await pendingGuard(page).waitFor();
      await expect(page.locator("#canvas"), `${link} opened afresh resolves pending offline edits before opening the server canvas`).toHaveCount(0);
    }

    await pendingGuard(page).click();
    await expect.poll(async () => draws(await boardNamed(project, "Pencil sketch")).length, "the offline stroke syncs").toBe(2);
    const synced = await boardNamed(project, "Pencil sketch");
    expect(synced.nodes.find((n) => n.id === note.id).text, "the server's note is kept").toBe(note.text);
    expect(synced.settings.linked_tasks).toEqual([linkedTask.id]);
    // The checkpoint can also be restored as a separate copy.
    await page.locator(`[data-drawing-action="restore"][data-id="${sketch.id}"]`).click();
    await page.locator("#canvas").waitFor();
    const copy = await boardNamed(project, "Pencil sketch (recovered)");
    expect(copy && copy.id !== sketch.id, "the copy is a separate board").toBe(true);
    expect(draws(copy)).toHaveLength(2);
    expect(copy.nodes.find((n) => n.id === note.id).text).toBe(note.text);
  } finally {
    await gateway.stop();
  }
});

onDevices(["desktop", "phone"], (device) => test("the Boards gallery fits the screen and opens a board", device === "desktop" ? gate : {}, async ({ page }) => {
  const { project, legacy, sketch } = await seedProject();
  await page.goto(`${app.base}/#project/${project.id}/board/${legacy.id}`);
  await page.locator("#canvas").waitFor();
  await clickControl(page.locator('[data-drawing-action="gallery"]'));
  await expect(page.locator(`[data-drawing-action="open"][data-id="${legacy.id}"]`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the gallery fits the viewport").toBe(true);
  await page.locator(`[data-drawing-action="open"][data-id="${sketch.id}"]`).click();
  await page.locator("#canvas").waitFor();
}));
