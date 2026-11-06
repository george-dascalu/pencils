// Pasted and dragged images (F0.22-30): an image pasted into a card's description, or into a note even
// while reading it, uploads as an attachment of that description or note, named like Obsidian's
// pasted images; a paste that also holds text (as a spreadsheet's copy, which adds a picture of the
// cells) pastes the text only, while a copied file whose text is only its name attaches; and an image dragged from a web page without a file extension takes
// one from its type.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Pasting" }) }));
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === id);
const PNG = [...Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")];
async function open(page, card) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(page.locator("#task-form")).toBeVisible();
}
// The clipboard as a screenshot tool leaves it: one image file, and text only when given.
const paste = (locator, { text = "", name = "image.png", type = "image/png" } = {}) =>
  locator.evaluate((el, { text, name, type, bytes }) => {
    const data = new DataTransfer();
    if (text) data.setData("text/plain", text);
    data.items.add(new File([new Uint8Array(bytes)], name, { type }));
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, { text, name, type, bytes: PNG });
const description = (page) => page.locator('#task-form .task-description [contenteditable="true"]');

test("an image pasted into the description uploads as a pasted image of the card", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Paste into description", body: "Before" });
  await open(page, card);
  await paste(description(page));
  await expect.poll(async () => (await saved(card.id)).body).toMatch(/!\[Pasted image \d{14}\.png\]\(\.\.\/attachments\/a-/);
  expect((await saved(card.id)).body).toContain("Before");
  await expect(page.getByRole("button", { name: /^Preview Pasted image \d{14}\.png$/ })).toBeVisible();
  // Done is told to screen readers only (F0.22-34); the list shows the file.
  const status = page.locator("#task-form .task-description .task-attachment-status");
  await expect(status).toHaveText("Files attached.");
  expect(await status.evaluate((el) => el.getBoundingClientRect().height), "not shown").toBeLessThanOrEqual(1);
});

test("a paste that also holds text pastes the text and attaches nothing", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Paste cells", body: "" });
  await open(page, card);
  let uploads = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/attachments")) uploads++; });
  await paste(description(page), { text: "Cell A1" });
  await expect.poll(async () => (await saved(card.id)).body).toContain("Cell A1");
  expect(uploads).toBe(0);
});

test("a file copied in a file manager, whose text is just its name, attaches under its own name", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Paste a copied file", body: "" });
  await open(page, card);
  await paste(description(page), { text: "/home/me/Pictures/holiday.png", name: "holiday.png" });
  await expect.poll(async () => (await saved(card.id)).body).toContain("![holiday.png](../attachments/a-");
  expect((await saved(card.id)).body).not.toContain("/home/me");
});

test("an image pasted on a note being read uploads to that note, not the description", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Paste into note", body: "Card text", notes: [{ id: "n-read", body: "Reading this note" }] });
  await open(page, card);
  const notes = page.getByRole("region", { name: "Notes", exact: true });
  await paste(notes.locator(".inline-preview"));
  await expect.poll(async () => (await saved(card.id)).notes?.[0]?.body).toMatch(/Pasted image \d{14}\.png/);
  expect((await saved(card.id)).body).toBe("Card text");
  await expect(notes.getByRole("button", { name: /^Preview Pasted image/ })).toBeVisible();
});

test("an image dragged from a web page without an extension takes one from its type", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Drop a web image", body: "" });
  await open(page, card);
  await description(page).evaluate((el, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "photo", { type: "image/png" }));
    for (const type of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
  }, PNG);
  await expect.poll(async () => (await saved(card.id)).body).toContain("![photo.png](../attachments/a-");
});
