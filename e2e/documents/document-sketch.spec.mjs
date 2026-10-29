// Owner request, 29 October 2026 (note-taking research, idea 11): sketches in documents, drawn in a
// pen pad (a panel, full screen on phones) and saved as an SVG that Obsidian shows plus the strokes
// that reopen it.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Sketches", key: "SK" }) }));
const stored = async (id) => (await app.store.getDocument(app.project.id, id)).body;
const sketchPath = (body) => body.match(/attachments\/s-[a-f0-9-]+\.svg/)?.[0];
async function draw(page, from, to) {
  const box = await page.locator(".sketch-canvas").boundingBox();
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + from[0] + ((to[0] - from[0]) * i) / 8, box.y + from[1] + ((to[1] - from[1]) * i) / 8);
  await page.mouse.up();
}
async function open(page, doc) {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator(".cm-content").waitFor();
}

onDevices(["desktop", "phone"], () => test("a sketch is drawn, embedded and reopened from the document", async ({ page, device }) => {
  const doc = await app.store.createDocument(app.project.id, { title: `Sketch ${device}`, body: "Intro\n" });
  await open(page, doc);
  if (device === "phone") await page.getByRole("button", { name: "Show formatting", exact: true }).click();
  await page.locator('#document-form [data-document-action="insert"]').click();
  await page.getByRole("button", { name: "Sketch", exact: true }).click();
  const pad = page.getByRole("dialog", { name: "Sketch" });
  await expect(pad).toBeVisible();
  const box = await pad.boundingBox(), { width, height } = page.viewportSize();
  if (device === "phone") expect([box.x, box.y, box.width, box.height].map(Math.round), "full screen on phones").toEqual([0, 0, width, height]);
  else expect(box.width < width && box.height < height, "a panel on wider screens").toBe(true);
  const save = pad.getByRole("button", { name: "Save sketch", exact: true });
  await expect(save).toBeDisabled();
  await draw(page, [40, 40], [160, 120]);
  await expect(pad.locator(".sketch-content [data-stroke]")).toHaveCount(1);
  await save.click();
  await expect(pad).toBeHidden();
  await expect.poll(async () => await stored(doc.id)).toMatch(/!\[\[attachments\/s-[a-f0-9-]+\.svg\]\]/);
  const first = sketchPath(await stored(doc.id));
  const svg = await page.request.get(`${app.base}/api/projects/${app.project.id}/${first}`);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect(svg.headers()["content-security-policy"]).toContain("default-src 'none'");
  // Tapping the sketch reopens it with its strokes; saving again points the embed at the new pair.
  const image = page.locator(".cm-content img[data-document-sketch]");
  await expect(image).toBeVisible();
  await image.click();
  await expect(pad).toBeVisible();
  await expect(pad.locator(".sketch-content [data-stroke]")).toHaveCount(1);
  await draw(page, [60, 140], [180, 60]);
  await save.click();
  await expect.poll(async () => sketchPath(await stored(doc.id))).not.toBe(first);
  expect(await stored(doc.id)).not.toContain(first);
}));

test("an unsaved sketch waits after the pad closes, and Undo takes back a stroke", async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: "Draft sketch", body: "" });
  await open(page, doc);
  await page.locator(".cm-content").click();
  await page.keyboard.type("/sketch");
  await page.locator(".cm-tooltip-autocomplete li", { hasText: "Sketch" }).click();
  const pad = page.getByRole("dialog", { name: "Sketch" });
  await draw(page, [40, 40], [160, 120]);
  await draw(page, [40, 140], [160, 60]);
  await expect(pad.locator(".sketch-content [data-stroke]")).toHaveCount(2);
  await pad.getByRole("button", { name: "Undo stroke", exact: true }).click();
  await expect(pad.locator(".sketch-content [data-stroke]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(pad).toBeHidden();
  await page.locator('#document-form [data-document-action="insert"]').click();
  await page.getByRole("button", { name: "Sketch", exact: true }).click();
  await expect(pad.locator(".sketch-content [data-stroke]")).toHaveCount(1);
  await pad.getByRole("button", { name: "Close sketch", exact: true }).click();
  await expect(pad).toBeHidden();
  expect(await stored(doc.id), "nothing is added until it's saved").toBe("");
});
