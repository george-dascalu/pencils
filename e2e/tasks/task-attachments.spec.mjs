// Card attachments: files dropped on a card upload while typing continues and are listed
// beside the description (not inside it) as portable Markdown links; invalid files are
// explained while valid ones upload; text, CSV, images and PDFs preview safely in a small
// popup and other files download; missing files and failed uploads are recoverable; uploads
// never leak into another card; a new card waits for its files; the layout and preview fit
// desktop, tablet and phone in light and dark themes. No Content Security Policy violations.
import fs from "node:fs/promises";
import path from "node:path";
import { test as base, expect, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

// Content Security Policy violations fail the test, like page errors.
const test = base.extend({
  page: async ({ page }, use) => {
    const violations = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy|violates.*directive/.test(message.text())) violations.push(message.text());
    });
    await use(page);
    expect(violations, "no Content Security Policy violations").toEqual([]);
  },
});

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Attachments" });
  const other = await store.createTask(project.id, { title: "Other task", body: "Leave intact" });
  const original = await store.createTask(project.id, { title: "Drop files here", body: "Original notes", related_records: [other.id] });
  await store.updateTask(project.id, original.id, { revision: original.revision, related_records: [other.id] });
  const child = await store.createTask(project.id, { title: "Existing child", parent: original.id });
  return { project, other, original, child };
});
// The card collects attachments step by step; later tests preview and protect them.
test.describe.configure({ mode: "serial" });

const snap = () => app.store.snapshot(app.project.id);
const saved = async (id = app.original.id) => (await snap()).tasks.find((t) => t.id === id);
const endpoint = () => `**/api/projects/${app.project.id}/attachments`;
const form = (page) => page.locator("#task-form");
const preview = (page) => page.locator("#attachment-preview");
const status = (page) => form(page).locator(".task-attachment-status");
const attachmentButton = (page, name) => form(page).getByRole("button", { name: `Preview ${name}`, exact: true });
const open = async (page, id) => {
  await page.locator(`[data-action=task-open][data-id="${id}"]`).first().click();
  await form(page).waitFor();
};
const visit = async (page, id = app.original.id) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, id);
};
const close = (page) => page.locator("[data-action=dialog-close]").click();
// Holds uploads until release() so a test can act while one is in flight.
async function holdUploads(page) {
  let release;
  let reached;
  const arrived = new Promise((resolve) => (reached = resolve));
  await page.route(endpoint(), async (route) => {
    await new Promise((resolve) => {
      release = resolve;
      reached();
    });
    await route.continue();
  });
  return { arrived, release: () => release() };
}
function samplePDF() {
  const stream = "BT /F1 18 Tf 30 150 Td (Attachment preview) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((value, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${value}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf).toString("base64");
}
async function drop(page, files, target = "#task-form") {
  await page.locator(target).evaluate((el, files) => {
    const dataTransfer = new DataTransfer();
    for (const file of files)
      dataTransfer.items.add(
        new File([file.base64 ? Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)) : file.size ? new Uint8Array(file.size) : file.data || "hello"], file.name, { type: file.type || "text/plain" }),
      );
    for (const type of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
  }, files);
}

test("the attachment model lists attachment links apart from the description and keeps reference links portable", async ({ page }) => {
  await page.goto(app.base);
  const model = await page.evaluate(async (project) => {
    const { taskAttachmentContent, retainTaskAttachments } = await import("/task-attachment-model.js");
    const source =
      "Notes\n\n![Old image](../attachments/a-1234.png)\n\n[Reference file][file]\n\n[file]: ../attachments/a-5678.txt\n\n```md\n![Example](../attachments/a-9999.png)\n```\n\nInline [file](attachments/a-5678.txt) stays in the sentence.\n\n[Other project](/api/projects/p-other/attachments/a-1111.txt)";
    return { ...taskAttachmentContent(source, project), retained: retainTaskAttachments("New notes", source, project) };
  }, app.project.id);
  expect(model.files.map((file) => file.file)).toEqual(["a-1234.png", "a-5678.txt"]);
  expect(model.description).not.toContain("![Old image]");
  expect(model.description).toContain("![Example]");
  expect(model.description).toContain("Inline [file]");
  expect(model.retained).toMatch(/\[Reference file\]\(\.\.\/attachments\/a-5678.txt\)/);
});

test("a file dropped on the description uploads while typing continues, keeping relationships", async ({ page }) => {
  await visit(page);
  await expect(form(page).locator(".task-extra,.task-parent-field,.task-dependencies,.file-path,.task-subtasks,.related-record-list,[data-feature=attach],[data-feature=task-template]")).toHaveCount(0);
  const upload = await holdUploads(page);
  await drop(page, [{ name: "design [v1].txt", data: "Document contents" }], '[aria-label="Task description"]');
  await upload.arrived;
  await page.getByRole("textbox", { name: "Task description", exact: true }).fill("Typed while uploading");
  upload.release();
  await expect.poll(async () => (await saved()).body).toContain("../attachments/");
  const task = await saved();
  expect(task.body).toMatch(/Typed while uploading/);
  expect(task.related_records).toEqual([app.other.id]);
  expect((await saved(app.child.id)).parent).toBe(app.original.id);
  const attachment = task.body.match(/\]\(\.\.\/(attachments\/[^)]+)\)/)[1];
  expect(await fs.readFile(path.resolve(app.root, path.dirname(task.file), "..", attachment), "utf8")).toBe("Document contents");
  await page.unroute(endpoint());
});

test("a multi-file drop keeps the valid files, explains the rejected ones and previews text and images", async ({ page }) => {
  await visit(page);
  await drop(page, [
    { name: "disallowed.exe" },
    { name: "too-large.txt", size: 10000001 },
    { name: "notes.md", data: "# Notes" },
    { name: "preview.png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=", type: "image/png" },
  ]);
  await expect.poll(async () => (await saved()).body).toContain("preview.png");
  const task = await saved();
  expect(task.body).toMatch(/\[notes.md\]/);
  expect(task.body).toMatch(/!\[preview.png\]/);
  await expect(status(page)).toContainText("disallowed.exe");
  await expect(status(page)).toContainText("under 10 MB");
  await expect(form(page).locator(".inline-rich img")).toHaveCount(0);
  await expect(form(page).locator(".task-attachment-open")).toHaveCount(3);
  const textFile = attachmentButton(page, "design [v1].txt");
  await textFile.click();
  await expect(preview(page).locator("pre")).toHaveText("Document contents");
  await page.keyboard.press("Escape");
  await expect(preview(page)).toHaveCount(0);
  await expect(textFile).toBeFocused();
  await attachmentButton(page, "preview.png").click();
  await page.waitForFunction(() => document.querySelector("#attachment-preview img")?.naturalWidth > 0);
  await preview(page).getByRole("button", { name: "Close attachment preview" }).click();
  await expect(preview(page)).toHaveCount(0);
});

test("description edits keep the attachments, listed apart and in portable Markdown", async ({ page }) => {
  await visit(page);
  await form(page).getByRole("textbox", { name: "Task description", exact: true }).fill("Updated notes");
  await expect.poll(async () => (await saved()).body).toMatch(/^Updated notes/);
  const task = await saved();
  expect(task.body).toMatch(/!\[preview.png\]/);
  expect(task.body).toMatch(/design \\\[v1\\\]\.txt/);
  await expect(form(page).locator(".task-attachment-open")).toHaveCount(3);
  await form(page).getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(form(page).locator("[name=body]")).toHaveValue(/attachments\//);
  await form(page).getByRole("button", { name: "Rich text", exact: true }).click();
  await expect(form(page).locator(".inline-rich")).toHaveText("Updated notes");
});

test("CSV previews as inert text, PDFs preview inline with framing headers, and other files download", async ({ page }) => {
  await visit(page);
  await drop(page, [
    { name: "plan.pdf", base64: samplePDF(), type: "application/pdf" },
    { name: "bundle.zip", data: "ZIP download bytes", type: "application/zip" },
    { name: "rows.csv", data: 'name,value\n<img onerror="window.unsafePreview=true">,1' },
  ]);
  await expect.poll(async () => (await saved()).body).toContain("rows.csv");
  await expect(form(page).locator(".task-attachment-open")).toHaveCount(6);
  await attachmentButton(page, "rows.csv").click();
  await expect(preview(page).locator("pre")).toContainText("<img onerror");
  await expect(preview(page).locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.unsafePreview)).toBe(undefined);
  await page.keyboard.press("Escape");
  const pdfEnabled = await page.evaluate(() => navigator.pdfViewerEnabled);
  const pdfResponse = pdfEnabled ? page.waitForResponse((response) => response.url().endsWith(".pdf?preview=1")) : null;
  await attachmentButton(page, "plan.pdf").click();
  await preview(page).locator("[data-preview-download]:not([hidden])").waitFor();
  if (pdfEnabled) {
    await preview(page).locator("iframe").waitFor();
    const response = await pdfResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toMatch(/^inline;/);
    expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers()["content-security-policy"]).toMatch(/frame-ancestors 'self'/);
  } else await expect(preview(page).locator(".attachment-preview-content")).toContainText(/not available in this browser/);
  await preview(page).getByRole("button", { name: "Close attachment preview" }).click();
  await attachmentButton(page, "bundle.zip").click();
  await preview(page).getByText("Download this file to open it on your device.").waitFor();
  const download = page.waitForEvent("download");
  await preview(page).getByRole("link", { name: "Download", exact: true }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toBe("bundle.zip");
  expect(await fs.readFile(await downloaded.path(), "utf8")).toBe("ZIP download bytes");
  await page.keyboard.press("Escape");
});

test("a missing file shows a recoverable error and a failed upload leaves the card unchanged", async ({ page }) => {
  await visit(page);
  const before = (await saved()).body;
  await page.route("**/attachments/a-*.txt", (route) => route.fulfill({ status: 404, body: "Missing" }));
  await attachmentButton(page, "design [v1].txt").click();
  await expect(preview(page).getByRole("alert")).toContainText(/could not be found/);
  await page.keyboard.press("Escape");
  await page.unroute("**/attachments/a-*.txt");
  expect((await saved()).body).toBe(before);
  await page.route(endpoint(), (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Upload unavailable" }) }));
  await drop(page, [{ name: "failed.txt" }]);
  await expect(status(page)).toContainText("Upload unavailable");
  expect((await saved()).body).toBe(before);
  await page.unroute(endpoint());
});

test("an upload that finishes after switching cards does not reach the other card", async ({ page }) => {
  await visit(page);
  const before = (await saved()).body;
  const upload = await holdUploads(page);
  await drop(page, [{ name: "late.txt" }]);
  await upload.arrived;
  await close(page);
  await open(page, app.other.id);
  const finished = page.waitForEvent("requestfinished", (request) => request.url().endsWith("/attachments"));
  upload.release();
  await finished;
  // Nothing changes when the late upload is ignored: wait past the autosave debounce
  // (450 ms) so a stray insert would have been saved.
  await page.waitForTimeout(500);
  await expect(form(page).locator("[name=body]")).toHaveValue("Leave intact");
  expect((await saved(app.other.id)).body).toBe("Leave intact");
  expect((await saved()).body).toBe(before);
  await page.unroute(endpoint());
});

test("a new card waits for its files before creating, and create another starts clean", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const before = (await snap()).tasks.length;
  await newCard(page);
  await form(page).locator("[name=title]").fill("New with attachment");
  await form(page).locator("[name=createAnother]").check();
  const upload = await holdUploads(page);
  await drop(page, [{ name: "new.txt" }]);
  await upload.arrived;
  await form(page).evaluate((el) => el.requestSubmit());
  await expect(status(page)).toContainText(/Wait for the files/);
  expect((await snap()).tasks).toHaveLength(before);
  upload.release();
  await expect(form(page).locator("[name=body]")).toHaveValue(/new\.txt/);
  await form(page).evaluate((el) => el.requestSubmit());
  await expect.poll(async () => (await snap()).tasks.length).toBe(before + 1);
  await expect(form(page).locator("[name=title]")).toHaveValue("");
  await expect(form(page).locator("[name=body]")).toHaveValue("");
  await page.unroute(endpoint());
});

test("the editor layout and the attachment preview fit desktop, tablet and phone in both themes", async ({ page }) => {
  await visit(page);
  // The open editor is resized through each width.
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 780) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
    for (const theme of ["light", "dark"]) {
      const where = `${width}px ${theme}`;
      await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
      const geometry = await form(page).evaluate((el) => {
        const fields = [...el.querySelectorAll(".task-metadata [name]")];
        const identity = [el.querySelector('[data-task-picker="type"]'), el.querySelector(".task-key"), el.querySelector("[name=title]")];
        const rect = (node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right };
        };
        return {
          names: fields.map((f) => f.name),
          fields: fields.map((f) => rect(f.closest(".field"))),
          identity: identity.map(rect),
          overflow: el.scrollWidth > el.clientWidth,
          description: rect(el.querySelector(".task-description")),
        };
      });
      // Field order is assignee, status, priority (0.19.9).
      expect(geometry.names).toEqual(["assignee", "status", "priority", "start", "due"]);
      // The key follows the title (PEN-4): type, title, key on phones; type above a title row elsewhere.
      if (width <= 600) expect(geometry.identity[2].x >= geometry.identity[0].right - 1 && geometry.identity[1].x >= geometry.identity[2].x, where).toBe(true);
      else expect(geometry.identity[0].y < geometry.identity[2].y && geometry.identity[1].x > geometry.identity[2].x, where).toBe(true);
      expect(geometry.description.y, `description below the fields: ${where}`).toBeGreaterThan(geometry.fields[4].y);
      expect(geometry.overflow, where).toBe(false);
      if (width >= 768) expect(Math.max(...geometry.fields.map((f) => f.y)) - Math.min(...geometry.fields.map((f) => f.y)), `fields share a row: ${where}`).toBeLessThan(2);
      await attachmentButton(page, "design [v1].txt").click();
      await preview(page).locator("pre").waitFor();
      const popup = await preview(page).boundingBox();
      expect(popup.x >= 0 && popup.y >= 0 && popup.x + popup.width <= width + 1 && popup.y + popup.height <= 1001, `preview on screen: ${where}`).toBe(true);
      // Outside click dismisses only the preview and leaves the editor usable.
      await form(page).locator("[name=title]").click();
      await expect(preview(page)).toHaveCount(0);
      await expect(form(page)).toBeVisible();
    }
  }
});

// Owner request (T19, 31 October 2026): Attachments adds files with a + beside its title, like
// Relationships' controls and the sidebar's lists, instead of a text button under the description.
test("Attachments adds files with a + beside its title", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, app.other.id);
  const heading = page.locator("#task-form .task-attachments-heading");
  await expect(heading.locator("h3")).toHaveText("Attachments");
  const add = heading.getByRole("button", { name: "Add attachments", exact: true });
  await expect(add, "an icon, no text").toHaveText("");
  await expect(add.locator("svg")).toHaveCount(1);
  const [title, button] = [await heading.locator("h3").boundingBox(), await add.boundingBox()];
  expect(button.x, "to the right of the title").toBeGreaterThan(title.x + title.width);
  expect(Math.abs(button.y + button.height / 2 - (title.y + title.height / 2)), "on the title's row").toBeLessThanOrEqual(2);
  await expect(page.locator("#task-form .task-attachment-choose:not(.icon-button)"), "no text button below the description").toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await add.click();
  expect((await chooser).isMultiple(), "several files at once").toBe(true);
});
