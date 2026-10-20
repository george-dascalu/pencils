import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-attachments-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Attachments" });
const other = await store.createTask(project.id, {
  title: "Other task",
  body: "Leave intact",
});
const original = await store.createTask(project.id, {
  title: "Drop files here",
  body: "Original notes",
  related_records: [other.id],
});
await store.updateTask(project.id, original.id, {
  revision: original.revision,
  related_records: [other.id],
});
const child = await store.createTask(project.id, {
  title: "Existing child",
  parent: original.id,
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "webkit" ? webkit : chromium
).launch({
  headless: true,
  ...(process.env.PDF_VIEWER === "1" ? { channel: "chromium" } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    /Content Security Policy|violates.*directive/.test(message.text())
  )
    errors.push(message.text());
});
const form = page.locator("#task-form");
const saved = async (id = original.id) =>
  (await store.snapshot(project.id)).tasks.find((t) => t.id === id);
async function until(fn) {
  for (let n = 0; n < 200; n++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Timed out waiting for attachment result");
}
const open = async (id) => {
  await page
    .locator(`[data-action=task-open][data-id="${id}"]`)
    .first()
    .click();
  await form.waitFor();
};
const close = () => page.locator("[data-action=dialog-close]").click();
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
async function drop(files, target = "#task-form") {
  await page.locator(target).evaluate((el, files) => {
    const dataTransfer = new DataTransfer();
    for (const file of files)
      dataTransfer.items.add(
        new File(
          [
            file.base64
              ? Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
              : file.size
                ? new Uint8Array(file.size)
                : file.data || "hello",
          ],
          file.name,
          { type: file.type || "text/plain" },
        ),
      );
    el.dispatchEvent(
      new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }),
    );
    el.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }),
    );
    el.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }),
    );
  }, files);
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const model = await page.evaluate(async (project) => {
    const { taskAttachmentContent, retainTaskAttachments } =
      await import("/task-attachment-model.js");
    const source =
      "Notes\n\n![Old image](../attachments/a-1234.png)\n\n[Reference file][file]\n\n[file]: ../attachments/a-5678.txt\n\n```md\n![Example](../attachments/a-9999.png)\n```\n\nInline [file](attachments/a-5678.txt) stays in the sentence.\n\n[Other project](/api/projects/p-other/attachments/a-1111.txt)";
    const parsed = taskAttachmentContent(source, project);
    return {
      ...parsed,
      retained: retainTaskAttachments("New notes", source, project),
    };
  }, project.id);
  assert.deepEqual(
    model.files.map((file) => file.file),
    ["a-1234.png", "a-5678.txt"],
  );
  assert.ok(!model.description.includes("![Old image]"));
  assert.ok(model.description.includes("![Example]"));
  assert.ok(model.description.includes("Inline [file]"));
  assert.match(
    model.retained,
    /\[Reference file\]\(\.\.\/attachments\/a-5678.txt\)/,
  );
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await open(original.id);
  assert.equal(
    await form
      .locator(
        ".task-extra,.task-parent-field,.task-dependencies,.file-path,.task-subtasks,.related-record-list,[data-feature=attach],[data-feature=task-template]",
      )
      .count(),
    0,
  );
  let release;
  const endpoint = `**/api/projects/${project.id}/attachments`;
  await page.route(endpoint, async (route) => {
    await new Promise((resolve) => (release = resolve));
    await route.continue();
  });
  await drop(
    [{ name: "design [v1].txt", data: "Document contents" }],
    '[aria-label="Task description"]',
  );
  await until(() => !!release);
  await page
    .getByRole("textbox", { name: "Task description", exact: true })
    .fill("Typed while uploading");
  release();
  await until(async () => (await saved()).body.includes("../attachments/"));
  let task = await saved();
  assert.match(task.body, /Typed while uploading/);
  assert.deepEqual(task.related_records, [other.id]);
  assert.equal((await saved(child.id)).parent, original.id);
  const attachment = task.body.match(/\]\(\.\.\/(attachments\/[^)]+)\)/)[1];
  assert.equal(
    await fs.readFile(
      path.resolve(root, path.dirname(task.file), "..", attachment),
      "utf8",
    ),
    "Document contents",
  );
  await page.unroute(endpoint);
  // Multi-file drops keep valid files even when one fails validation.
  await drop([
    { name: "disallowed.exe" },
    { name: "too-large.txt", size: 10000001 },
    { name: "notes.md", data: "# Notes" },
    {
      name: "preview.png",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=",
      type: "image/png",
    },
  ]);
  await until(async () => (await saved()).body.includes("preview.png"));
  task = await saved();
  assert.match(task.body, /\[notes.md\]/);
  assert.match(task.body, /!\[preview.png\]/);
  assert.match(
    await form.locator(".task-attachment-status").innerText(),
    /disallowed.exe/,
  );
  assert.equal(await form.locator(".inline-rich img").count(), 0);
  assert.equal(await form.locator(".task-attachment-open").count(), 3);
  const preview = page.locator("#attachment-preview");
  const textFile = form.getByRole("button", {
    name: "Preview design [v1].txt",
    exact: true,
  });
  await textFile.click();
  await preview.locator("pre").waitFor();
  assert.equal(await preview.locator("pre").textContent(), "Document contents");
  await page.keyboard.press("Escape");
  assert.equal(await preview.count(), 0);
  assert.ok(await textFile.evaluate((el) => el === document.activeElement));
  await form
    .getByRole("button", { name: "Preview preview.png", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("#attachment-preview img")?.naturalWidth > 0,
  );
  await preview
    .getByRole("button", { name: "Close attachment preview" })
    .click();
  // Description edits preserve attachments, while Markdown remains editable and portable.
  await form
    .getByRole("textbox", { name: "Task description", exact: true })
    .fill("Updated notes");
  await until(async () => (await saved()).body.startsWith("Updated notes"));
  task = await saved();
  assert.match(task.body, /!\[preview.png\]/);
  assert.match(task.body, /design \\\[v1\\\]\.txt/);
  assert.equal(await form.locator(".task-attachment-open").count(), 3);
  await form.getByRole("button", { name: "Markdown", exact: true }).click();
  assert.match(await form.locator("[name=body]").inputValue(), /attachments\//);
  await form.getByRole("button", { name: "Rich text", exact: true }).click();
  assert.equal(await form.locator(".inline-rich").innerText(), "Updated notes");
  assert.match(
    await form.locator(".task-attachment-status").innerText(),
    /under 10 MB/,
  );
  await drop([
    { name: "plan.pdf", base64: samplePDF(), type: "application/pdf" },
    { name: "bundle.zip", data: "ZIP download bytes", type: "application/zip" },
    {
      name: "rows.csv",
      data: 'name,value\n<img onerror="window.unsafePreview=true">,1',
    },
  ]);
  await until(async () => (await saved()).body.includes("rows.csv"));
  assert.equal(await form.locator(".task-attachment-open").count(), 6);
  await form
    .getByRole("button", { name: "Preview rows.csv", exact: true })
    .click();
  await preview.locator("pre").waitFor();
  assert.match(await preview.locator("pre").textContent(), /<img onerror/);
  assert.equal(await preview.locator("img").count(), 0);
  assert.equal(await page.evaluate(() => window.unsafePreview), undefined);
  await page.keyboard.press("Escape");
  const pdfEnabled = await page.evaluate(() => navigator.pdfViewerEnabled);
  const pdfResponse = pdfEnabled
    ? page.waitForResponse((response) =>
        response.url().endsWith(".pdf?preview=1"),
      )
    : null;
  await form
    .getByRole("button", { name: "Preview plan.pdf", exact: true })
    .click();
  await preview.locator("[data-preview-download]:not([hidden])").waitFor();
  if (pdfEnabled) {
    await preview.locator("iframe").waitFor();
    const response = await pdfResponse;
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-disposition"], /^inline;/);
    assert.equal(response.headers()["x-frame-options"], "SAMEORIGIN");
    assert.match(
      response.headers()["content-security-policy"],
      /frame-ancestors 'self'/,
    );
    await page.waitForTimeout(500);
  } else
    assert.match(
      await preview.locator(".attachment-preview-content").textContent(),
      /not available in this browser/,
    );
  await page.screenshot({
    path: `/tmp/pencils-attachment-pdf-${process.env.BROWSER || "chromium"}.png`,
  });
  await preview
    .getByRole("button", { name: "Close attachment preview" })
    .click();
  await form
    .getByRole("button", { name: "Preview bundle.zip", exact: true })
    .click();
  await preview
    .getByText("Download this file to open it on your device.")
    .waitFor();
  const downloadEvent = page.waitForEvent("download");
  await preview.getByRole("link", { name: "Download", exact: true }).click();
  const downloaded = await downloadEvent;
  assert.equal(downloaded.suggestedFilename(), "bundle.zip");
  assert.equal(
    await fs.readFile(await downloaded.path(), "utf8"),
    "ZIP download bytes",
  );
  await page.keyboard.press("Escape");
  // Missing files display a recoverable error without modifying the task.
  await page.route("**/attachments/a-*.txt", (route) =>
    route.fulfill({ status: 404, body: "Missing" }),
  );
  await textFile.click();
  await preview.getByRole("alert").waitFor();
  assert.match(
    await preview.getByRole("alert").textContent(),
    /could not be found/,
  );
  await page.keyboard.press("Escape");
  await page.unroute("**/attachments/a-*.txt");
  task = await saved();
  const beforeFailure = task.body;
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Upload unavailable" }),
    }),
  );
  await drop([{ name: "failed.txt" }]);
  await until(async () =>
    (await form.locator(".task-attachment-status").innerText()).includes(
      "Upload unavailable",
    ),
  );
  assert.equal((await saved()).body, beforeFailure);
  await page.unroute(endpoint);
  // Pending completion must not leak into a different editor.
  release = null;
  await page.route(endpoint, async (route) => {
    await new Promise((resolve) => (release = resolve));
    await route.continue();
  });
  await drop([{ name: "late.txt" }]);
  await until(() => !!release);
  await close();
  await open(other.id);
  release();
  await page.waitForTimeout(400);
  assert.equal(await form.locator("[name=body]").inputValue(), "Leave intact");
  assert.equal((await saved(other.id)).body, "Leave intact");
  assert.equal((await saved()).body, beforeFailure);
  await page.unroute(endpoint);
  await close();
  // A new task cannot submit before its file arrives; create another starts clean.
  await page.locator("[data-action=task-new]").click();
  await form.locator("[name=title]").fill("New with attachment");
  await form.locator("[name=createAnother]").check();
  release = null;
  await page.route(endpoint, async (route) => {
    await new Promise((resolve) => (release = resolve));
    await route.continue();
  });
  await drop([{ name: "new.txt" }]);
  await until(() => !!release);
  await form.evaluate((el) => el.requestSubmit());
  assert.equal((await store.snapshot(project.id)).tasks.length, 3);
  assert.match(
    await form.locator(".task-attachment-status").innerText(),
    /Wait for the files/,
  );
  release();
  await until(async () =>
    (await form.locator("[name=body]").inputValue()).includes("new.txt"),
  );
  await form.evaluate((el) => el.requestSubmit());
  await until(
    async () => (await store.snapshot(project.id)).tasks.length === 4,
  );
  await until(
    async () => (await form.locator("[name=title]").inputValue()) === "",
  );
  assert.equal(await form.locator("[name=body]").inputValue(), "");
  await close();
  await open(original.id);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 780)
      await page.waitForFunction(
        () =>
          document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
      );
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => window.PencilsAppearance.write({ theme }),
        theme,
      );
      const geometry = await form.evaluate((el) => {
        const fields = [...el.querySelectorAll(".task-metadata .field")];
        const identity = [
          el.querySelector('[data-task-picker="type"]'),
          el.querySelector(".task-key"),
          el.querySelector("[name=title]"),
        ];
        const rect = (node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right };
        };
        return {
          names: fields.map((f) => f.querySelector("[name]").name),
          fields: fields.map(rect),
          identity: identity.map(rect),
          overflow: el.scrollWidth > el.clientWidth,
          description: rect(el.querySelector(".task-description")),
        };
      });
      assert.deepEqual(geometry.names, [
        "assignee",
        "priority",
        "status",
        "start",
        "due",
      ]);
      assert.ok(
        geometry.identity[0].x < geometry.identity[1].x &&
          geometry.identity[1].x < geometry.identity[2].x,
      );
      assert.ok(geometry.description.y > geometry.fields[4].y);
      assert.equal(geometry.overflow, false);
      if (width >= 768)
        assert.ok(
          Math.max(...geometry.fields.map((f) => f.y)) -
            Math.min(...geometry.fields.map((f) => f.y)) <
            2,
        );
      await page.screenshot({
        path: `/tmp/pencils-task-layout-${width}-${theme}-${process.env.BROWSER || "chromium"}.png`,
      });
      await form
        .getByRole("button", { name: "Preview design [v1].txt", exact: true })
        .click();
      await preview.locator("pre").waitFor();
      const popup = await preview.boundingBox();
      assert.ok(
        popup.x >= 0 &&
          popup.y >= 0 &&
          popup.x + popup.width <= width + 1 &&
          popup.y + popup.height <= 1001,
      );
      await page.screenshot({
        path: `/tmp/pencils-attachment-preview-${width}-${theme}-${process.env.BROWSER || "chromium"}.png`,
      });
      // Outside click dismisses only the preview and leaves the editor usable.
      await form.locator("[name=title]").click();
      assert.equal(await preview.count(), 0);
      assert.ok(await form.isVisible());
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: attachment list and popup previews, portable Markdown and description preservation, responsive themes, drag/drop uploads, autosave, legacy relationships, upload errors, pending creation, and editor isolation.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
