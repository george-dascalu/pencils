import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-drawing-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Drawing tests" }),
  server = createServer(store);
const legacy = await store.createBoard(project.id, {
  title: "Existing drawing",
});
await store.updateBoard(project.id, legacy.id, {
  revision: legacy.revision,
  settings: { drawing: true },
});
const linkedTask = await store.createTask(project.id, { title: "Linked task" });
await store.updateProject(project.id, {
  revision: project.revision,
  default_view: "drawing",
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
// Stop the actual origin during the offline phase. WebKit's setOffline(true)
// rejects even service-worker responses: microsoft/playwright#42775.
const connections = new Set();
const gateway = net.createServer((socket) => {
  const upstream = net.connect(server.address().port, "127.0.0.1");
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
await new Promise((r) => gateway.listen(0, "127.0.0.1", r));
const port = gateway.address().port;
const base = `http://127.0.0.1:${port}`;
const browser = await (
    process.env.BROWSER === "webkit"
      ? webkit
      : process.env.BROWSER === "firefox"
        ? firefox
        : chromium
  ).launch(),
  page = await browser.newPage({ viewport: { width: 1300, height: 950 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.locator(".project-link").click();
  assert.equal(await page.locator('[data-view="drawing"]').count(), 0);
  assert.equal(
    await page.locator('.tabs [aria-current="page"]').getAttribute("data-view"),
    "board",
    "Legacy default Drawing opens Board",
  );
  assert.equal(
    await page
      .locator('#project-view-switcher option[value="drawing"]')
      .count(),
    0,
  );
  await page.locator('[data-view="board"]').click();
  await page.locator("#canvas").waitFor();
  const boardMenu = page.locator('[data-board-menu="board"] summary');
  await boardMenu.click();
  await page.locator('[data-action="board-new"]').click();
  await page.locator('#board-form [name="title"]').fill("Pencil sketch");
  await page.locator('#board-form .dialog-foot button[type="submit"]').click();
  await page.locator("#canvas").waitFor();
  await page.locator('.board-tools [data-feature="draw-tool"]').click();
  const rect = await page.locator("#canvas").boundingBox();
  await page.mouse.move(rect.x + 220, rect.y + 200);
  await page.mouse.down();
  await page.mouse.move(rect.x + 360, rect.y + 280, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-drawing-save]")
      ?.textContent.includes("server"),
  );
  await page.waitForTimeout(500);
  let board = (await store.snapshot(project.id)).boards.find(
    (b) => b.title === "Pencil sketch",
  );
  assert.ok(board);
  assert.equal(board.nodes.filter((n) => n.type === "draw").length, 1);
  // Normal canvases can be linked to tasks, not only old Drawing canvases.
  await boardMenu.click();
  await page.locator('[data-drawing-action="link-task"]').click();
  await page.locator(`#drawing-links [value="${linkedTask.id}"]`).check();
  await page.locator("#drawing-links .dialog-foot button").click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-drawing-save]")?.textContent ===
      "Saved on this device and server",
  );
  board = (await store.snapshot(project.id)).boards.find(
    (b) => b.id === board.id,
  );
  assert.deepEqual(board.settings.linked_tasks, [linkedTask.id]);
  const note = {
    id: "offline-note",
    type: "sticky",
    x: 600,
    y: 100,
    w: 200,
    h: 200,
    text: "Keep this note",
  };
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [...board.nodes, note],
  });
  await page.reload();
  await page.locator("#canvas").waitFor();
  assert.equal(await page.locator("#board-select option").count(), 3);
  // Stored legacy view preferences are aliases too.
  await page.evaluate(
    (id) =>
      localStorage.setItem(`pencils:view:${id}`, JSON.stringify("drawing")),
    project.id,
  );
  await page.reload();
  await page.locator("#canvas").waitFor();
  assert.equal(
    await page.locator('.tabs [aria-current="page"]').getAttribute("data-view"),
    "board",
  );
  await boardMenu.click();
  await page.locator('[data-drawing-action="gallery"]').click();
  assert.equal(await page.locator('[data-drawing-action="open"]').count(), 3);
  assert.ok(
    await page
      .locator(`[data-drawing-action="open"][data-id="${legacy.id}"]`)
      .isVisible(),
  );
  assert.ok(
    !board.settings?.drawing,
    "Ordinary boards receive all drawing tools",
  );
  await page.locator('[data-drawing-action="recover"]').click();
  await page
    .getByText(/Pencil sketch/)
    .last()
    .waitFor();
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator('[data-drawing-action="offline"]').click();
  await page.waitForFunction(
    () => navigator.serviceWorker.controller || navigator.serviceWorker.ready,
  );
  await page.waitForTimeout(1000);
  await page.goto(`${base}/drawing-offline.html`);
  await page.locator(`[data-open$="/${board.id}"]`).click();
  for (const socket of connections) socket.destroy();
  await new Promise((r) => gateway.close(r));
  assert.equal(
    await page.evaluate(() =>
      fetch("/api/health").then(
        () => true,
        () => false,
      ),
    ),
    false,
    "The origin must be unavailable; offline reload cannot use the server",
  );
  const box = await page.locator("#offline-canvas").boundingBox();
  await page.mouse.move(box.x + 130, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 180, { steps: 8 });
  await page.mouse.up();
  await page.getByText("Saved on this device · pending server sync").waitFor();
  await page.reload();
  await page.locator(`[data-open$="/${board.id}"]`).click();
  assert.equal(await page.locator("#offline-content > g > g").count(), 2);
  await new Promise((r) => gateway.listen(port, "127.0.0.1", r));
  await page.goto(base);
  // Restoring Board from local preferences must guard pending edits too.
  await page.locator('[data-drawing-action="sync"]').waitFor();
  assert.equal(await page.locator("#canvas").count(), 0);
  await page.locator('[data-action="dialog-close"]').click();
  await page
    .locator(`[data-drawing-action="open"][data-id="${legacy.id}"]`)
    .click();
  await page.locator("#canvas").waitFor();
  await page.selectOption("#board-select", board.id);
  await page.locator('[data-drawing-action="sync"]').waitFor();
  assert.equal(
    await page.locator("#canvas").count(),
    0,
    "Canvas selector protects pending offline work",
  );
  await page.goto(`${base}/#project/${project.id}/board/${board.id}`);
  await page.reload();
  await page.locator('[data-drawing-action="sync"]').waitFor();
  assert.equal(await page.locator("#canvas").count(), 0);
  await page.goto(`${base}/#project/${project.id}/drawing/${board.id}`);
  await page.reload();
  await page.locator('[data-drawing-action="sync"]').waitFor();
  assert.equal(
    await page.locator("#canvas").count(),
    0,
    "Direct links must resolve pending offline edits before opening the server canvas",
  );
  await page.locator('[data-drawing-action="sync"]').click();
  await page.waitForTimeout(700);
  board = (await store.snapshot(project.id)).boards.find(
    (b) => b.title === "Pencil sketch",
  );
  assert.equal(board.nodes.filter((n) => n.type === "draw").length, 2);
  assert.equal(board.nodes.find((n) => n.id === note.id).text, note.text);
  assert.deepEqual(board.settings.linked_tasks, [linkedTask.id]);
  await page
    .locator(`[data-drawing-action="restore"][data-id="${board.id}"]`)
    .click();
  await page.locator("#canvas").waitFor();
  const copy = (await store.snapshot(project.id)).boards.find(
    (b) => b.title === "Pencil sketch (recovered)",
  );
  assert.ok(copy && copy.id !== board.id);
  assert.equal(copy.nodes.filter((n) => n.type === "draw").length, 2);
  assert.equal(copy.nodes.find((n) => n.id === note.id).text, note.text);
  for (const width of [1300, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(250);
    await boardMenu.click();
    await page.locator('[data-drawing-action="gallery"]').click();
    assert.ok(
      await page
        .locator(`[data-drawing-action="open"][data-id="${legacy.id}"]`)
        .isVisible(),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Gallery fits the viewport",
    );
    await page.screenshot({ path: `/tmp/pencils-board-gallery-${width}.png` });
    await page
      .locator(`[data-drawing-action="open"][data-id="${copy.id}"]`)
      .click();
    await page.locator("#canvas").waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: unified Board gallery, legacy drawings, shared pen, device checkpoints, offline reload and guarded Board/legacy links.",
  );
} finally {
  await browser.close();
  for (const socket of connections) socket.destroy();
  if (gateway.listening) await new Promise((r) => gateway.close(r));
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
