import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAFAAAAAoCAIAAADmAupWAAAATklEQVR4nO3PQRHAIADAMEAi3nhjdS62uy5R0M597viT9XXA2wzXGa4zXGe4znCd4TrDdYbrDNcZrjNcZ7jOcJ3hOsN1husM1xmuM1z3AGYwAdYPZWEMAAAAAElFTkSuQmCC",
  "base64",
);
// Two frames, red then blue, with a repeating animation loop.
const gif = Buffer.from(
  "R0lGODlhFAAKAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQADwAAACwAAAAAFAAKAAAIGQABCBxIsKDBgwgTKlzIsKHDhxAjSpyoMCAAIfkEAQ8AAQAsAAAAABQACgCBAAD/AAAAAAAAAAAACBkAAQgcSLCgwYMIEypcyLChw4cQI0qcqDAgADs=",
  "base64",
);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-board-images-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Board images" });
const board = (await store.snapshot(project.id)).boards[0];
const other = await store.createBoard(project.id, { title: "Other canvas" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async (id = board.id) =>
  (await store.snapshot(project.id)).boards.find((b) => b.id === id);
async function until(fn) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await page.waitForTimeout(50);
  }
  throw new Error("Board image changes did not settle");
}
async function upload(files) {
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Add images or GIFs", exact: true })
    .click();
  const input = await chooser;
  assert.ok(input.isMultiple());
  await input.setFiles(files);
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator('[data-view="board"]').click();
  await page.locator("#board-select").selectOption(board.id);
  await upload([
    { name: "Landscape.png", mimeType: "image/png", buffer: png },
    { name: "Animated.gif", mimeType: "image/gif", buffer: gif },
  ]);
  await until(async () => (await current()).nodes.length === 2);
  let nodes = (await current()).nodes;
  assert.equal(await page.locator(".board-node.image.selected").count(), 2);
  for (const n of nodes) {
    assert.ok(
      Math.abs(n.w / (n.h - 26) - 2) < 0.02,
      "Initial image proportions are retained",
    );
    const response = await page.request.get(
      `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/${n.src}`,
    );
    assert.equal(
      response.headers()["content-type"],
      n.text.endsWith("gif") ? "image/gif" : "image/png",
    );
    assert.deepEqual(
      await response.body(),
      n.text.endsWith("gif") ? gif : png,
      "Original image bytes, including GIF frames, are retained",
    );
    const img = page.locator(`[data-node="${n.id}"] img`);
    await until(() => img.evaluate((el) => el.complete && el.naturalWidth > 0));
    assert.equal(
      await img.evaluate((el) => getComputedStyle(el).objectFit),
      "contain",
    );
  }
  await page.keyboard.press("Control+z");
  await until(async () => (await current()).nodes.length === 0);
  await page.keyboard.press("Control+Shift+z");
  await until(async () => (await current()).nodes.length === 2);
  await page.reload();
  await until(
    async () => (await page.locator(".board-node.image").count()) === 2,
  );
  // A drop uses board coordinates at the pointer and the same upload path.
  const canvas = await page.locator("#canvas").boundingBox();
  const x = canvas.x + canvas.width - 160,
    y = canvas.y + 200;
  const transfer = await page.evaluateHandle(
    ({ bytes }) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], "Dropped.gif", { type: "image/gif" }),
      );
      return data;
    },
    { bytes: [...gif] },
  );
  await page
    .locator("#canvas")
    .dispatchEvent("dragover", {
      dataTransfer: transfer,
      clientX: x,
      clientY: y,
    });
  assert.ok(await page.locator("#canvas.image-drop-active").count());
  await page
    .locator("#canvas")
    .dispatchEvent("drop", { dataTransfer: transfer, clientX: x, clientY: y });
  await until(async () => (await current()).nodes.length === 3);
  assert.equal(await page.locator("#canvas.image-drop-active").count(), 0);
  const dropped = (await current()).nodes.find((n) => n.text === "Dropped.gif");
  const dropBox = await page
    .locator(`[data-node="${dropped.id}"]`)
    .boundingBox();
  assert.ok(Math.abs(dropBox.x + dropBox.width / 2 - x) < 2);
  assert.ok(Math.abs(dropBox.y + dropBox.height / 2 - y) < 2);
  // Invalid formats and corrupt images never create broken cards.
  await upload([
    {
      name: "Broken.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("broken"),
    },
  ]);
  await page.getByText(/Broken.gif: This image could not be opened/).waitFor();
  assert.equal((await current()).nodes.length, 3);
  await upload([
    {
      name: "Too large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(10_000_001),
    },
  ]);
  await page.getByText(/Too large.png: Choose an image up to 10 MB/).waitFor();
  assert.equal((await current()).nodes.length, 3);
  // Do not add an in-flight upload to whichever board happens to be open later.
  let release;
  const pending = new Promise((r) => (release = r));
  let started;
  const intercepted = new Promise((r) => (started = r));
  await page.route("**/attachments", async (route) => {
    started();
    await pending;
    await route.continue();
  });
  await upload([
    { name: "Interrupted.png", mimeType: "image/png", buffer: png },
  ]);
  await intercepted;
  await page.locator("#board-select").selectOption(other.id);
  release();
  await page
    .getByText(/Image import stopped because you left the board/)
    .waitFor();
  assert.equal((await current(other.id)).nodes.length, 0);
  assert.equal((await current()).nodes.length, 3);
  await page.unroute("**/attachments");
  // The same picker remains reachable on mobile, including dark mode.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await upload([{ name: "Mobile.gif", mimeType: "image/gif", buffer: gif }]);
  await until(async () => (await current(other.id)).nodes.length === 1);
  await page.waitForFunction(() => !document.querySelector("#toasts .toast"));
  await page.screenshot({
    path: `/tmp/pencils-board-images-${process.env.BROWSER || "chromium"}-mobile.png`,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: sidebar picker, multiple images, original animated GIFs, proportions, drop coordinates, undo/redo, reload, invalid uploads, board-switch protection and mobile dark mode.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-board-images-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
