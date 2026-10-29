// Board images: the toolbar picker adds several images and animated GIFs at once, keeping their
// proportions and original bytes (GIF frames included); a drop lands at the pointer; undo/redo and
// reload keep them; invalid or oversized files never create broken cards; an upload in flight is
// not added to another board opened meanwhile; and the picker stays reachable on a dark phone.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAFAAAAAoCAIAAADmAupWAAAATklEQVR4nO3PQRHAIADAMEAi3nhjdS62uy5R0M597viT9XXA2wzXGa4zXGe4znCd4TrDdYbrDNcZrjNcZ7jOcJ3hOsN1husM1xmuM1z3AGYwAdYPZWEMAAAAAElFTkSuQmCC", "base64");
// Two frames, red then blue, with a repeating animation loop.
const gif = Buffer.from("R0lGODlhFAAKAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQADwAAACwAAAAAFAAKAAAIGQABCBxIsKDBgwgTKlzIsKHDhxAjSpyoMCAAIfkEAQ8AAQAsAAAAABQACgCBAAD/AAAAAAAAAAAACBkAAQgcSLCgwYMIEypcyLChw4cQI0qcqDAgADs=", "base64");

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board images" });
  const board = (await store.snapshot(project.id)).boards[0];
  const other = await store.createBoard(project.id, { title: "Other canvas" });
  return { project, board, other };
});
const current = async (id = app.board.id) => (await app.store.snapshot(app.project.id)).boards.find((b) => b.id === id);
const count = async (id) => (await current(id)).nodes.length;
// Both boards start empty.
test.beforeEach(async () => {
  for (const id of [app.board.id, app.other.id]) {
    const board = await current(id);
    await app.store.updateBoard(app.project.id, id, { revision: board.revision, nodes: [], edges: [] });
  }
});
async function openBoard(page, id = app.board.id) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  await page.locator("#board-select").selectOption(id);
}
async function upload(page, files) {
  const chooser = page.waitForEvent("filechooser");
  const add = page.getByRole("button", { name: "Add images or GIFs", exact: true });
  // Since 0.18.26 phones keep creation tools in the More canvas tools panel.
  // Wait for whichever the board toolbar shows before choosing.
  await page.locator('[data-feature="image-add"]:visible, .phone-board-more:visible').first().waitFor();
  if (!(await add.isVisible())) await page.getByRole("button", { name: "More canvas tools", exact: true }).click();
  await add.click();
  const input = await chooser;
  expect(input.isMultiple(), "the picker accepts several files").toBe(true);
  await input.setFiles(files);
}

test("images and animated GIFs keep their proportions and original bytes, with undo, redo and reload", async ({ page }) => {
  await openBoard(page);
  await upload(page, [
    { name: "Landscape.png", mimeType: "image/png", buffer: png },
    { name: "Animated.gif", mimeType: "image/gif", buffer: gif },
  ]);
  await expect.poll(() => count()).toBe(2);
  const nodes = (await current()).nodes;
  await expect(page.locator(".board-node.image.selected")).toHaveCount(2);
  for (const n of nodes) {
    expect(Math.abs(n.w / (n.h - 26) - 2), "initial image proportions are retained").toBeLessThan(0.02);
    const response = await page.request.get(`${app.base}/api/projects/${app.project.id}/${n.src}`);
    expect(response.headers()["content-type"]).toBe(n.text.endsWith("gif") ? "image/gif" : "image/png");
    expect(await response.body(), "original image bytes, including GIF frames, are retained").toEqual(n.text.endsWith("gif") ? gif : png);
    const img = page.locator(`[data-node="${n.id}"] img`);
    await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(img).toHaveCSS("object-fit", "contain");
  }
  await page.keyboard.press("Control+z");
  await expect.poll(() => count()).toBe(0);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => count()).toBe(2);
  await page.reload();
  await expect(page.locator(".board-node.image")).toHaveCount(2);
});

test("a dropped image lands at the pointer in board coordinates", async ({ page }) => {
  await openBoard(page);
  // A drop uses board coordinates at the pointer and the same upload path.
  const canvas = await page.locator("#canvas").boundingBox();
  const x = canvas.x + canvas.width - 160, y = canvas.y + 200;
  const transfer = await page.evaluateHandle(({ bytes }) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "Dropped.gif", { type: "image/gif" }));
    return data;
  }, { bytes: [...gif] });
  await page.locator("#canvas").dispatchEvent("dragover", { dataTransfer: transfer, clientX: x, clientY: y });
  await expect(page.locator("#canvas.image-drop-active")).toHaveCount(1);
  await page.locator("#canvas").dispatchEvent("drop", { dataTransfer: transfer, clientX: x, clientY: y });
  await expect.poll(() => count()).toBe(1);
  await expect(page.locator("#canvas.image-drop-active")).toHaveCount(0);
  const dropped = (await current()).nodes.find((n) => n.text === "Dropped.gif");
  const dropBox = await page.locator(`[data-node="${dropped.id}"]`).boundingBox();
  expect(Math.abs(dropBox.x + dropBox.width / 2 - x)).toBeLessThan(2);
  expect(Math.abs(dropBox.y + dropBox.height / 2 - y)).toBeLessThan(2);
});

test("invalid and oversized images never create broken cards", async ({ page }) => {
  await openBoard(page);
  await upload(page, [{ name: "Broken.gif", mimeType: "image/gif", buffer: Buffer.from("broken") }]);
  await page.getByText(/Broken.gif: This image could not be opened/).waitFor();
  expect(await count()).toBe(0);
  await upload(page, [{ name: "Too large.png", mimeType: "image/png", buffer: Buffer.alloc(10_000_001) }]);
  await page.getByText(/Too large.png: Choose an image up to 10 MB/).waitFor();
  expect(await count()).toBe(0);
});

test("an upload in flight is not added to another board opened meanwhile", async ({ page }) => {
  await openBoard(page);
  let release, started;
  const pending = new Promise((r) => (release = r));
  const intercepted = new Promise((r) => (started = r));
  await page.route("**/attachments", async (route) => {
    started();
    await pending;
    await route.continue();
  });
  await upload(page, [{ name: "Interrupted.png", mimeType: "image/png", buffer: png }]);
  await intercepted;
  await page.locator("#board-select").selectOption(app.other.id);
  release();
  await page.getByText(/Image import stopped because you left the board/).waitFor();
  expect(await count(app.other.id)).toBe(0);
  expect(await count(app.board.id)).toBe(0);
  await page.unroute("**/attachments");
});

onDevices(["phone"], () => {
  test("the picker stays reachable on a phone in the dark theme", async ({ page }) => {
    await openBoard(page, app.other.id);
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    await upload(page, [{ name: "Mobile.gif", mimeType: "image/gif", buffer: gif }]);
    await expect.poll(() => count(app.other.id)).toBe(1);
    await page.waitForFunction(() => !document.querySelector("#toasts .toast"));
  });
});
