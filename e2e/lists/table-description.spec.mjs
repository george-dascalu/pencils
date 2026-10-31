// Table Description column: a plain-text preview of the Markdown body (no links,
// images or attachment names), compact rows that follow control sizing, the shared
// rich editor for editing (attachment links kept), remembered column choices, keyboard and
// touch opening, both themes and the CSV export.
import fs from "node:fs/promises";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

const body = "# First paragraph\n\n**Second** paragraph with [a link](https://example.com).\n\n[Notes](../attachments/a-abc.txt)\n";
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Descriptions" });
  const task = await store.createTask(project.id, { title: "Detailed task", body });
  const empty = await store.createTask(project.id, { title: "Empty task" });
  await store.createTask(project.id, { title: "Long task", body: "Long description. ".repeat(100) });
  return { project, task, empty };
});

const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id);
const row = (page) => page.locator(`[data-table-task="${app.task.id}"]`);
const preview = (page) => row(page).locator(".table-description");
const headers = (page) => page.locator("thead th[data-column-key]").evaluateAll((els) => els.map((el) => el.dataset.columnKey));

async function openTable(page, device) {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await row(page).waitFor();
  if (device === "phone") await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
}

// Tests that edit the description put the original back for the next one.
test.afterEach(async () => {
  const current = await saved();
  if (current.body !== body) await app.store.updateTask(app.project.id, app.task.id, { body, revision: current.revision });
});

onDevices(["desktop", "phone"], () => {
  test("descriptions preview as plain text in compact rows and open the editor with attachments, in both themes", async ({ page, device }) => {
    await openTable(page, device);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
      await expect(preview(page)).toHaveText(/First paragraph Second paragraph with a link\./);
      await expect(preview(page)).not.toHaveText(/Notes|attachments|\*\*/);
      await expect(preview(page).locator("a,img,script")).toHaveCount(0);
      await expect(page.locator(`[data-table-task="${app.empty.id}"] .table-description`)).toHaveText("Add a description…");
      const heights = await page.locator("[data-table-task]").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      const controlHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--control-height")));
      // Phones also display the card ID beneath its title.
      // Rows leave an 8px inset around card-sized fields (0.19.10).
      expect(Math.max(...heights), `Compact rows follow control sizing: ${heights}`).toBeLessThanOrEqual(controlHeight + (device === "phone" ? 22 : 12));
      await preview(page).scrollIntoViewIfNeeded();
      if (device === "phone") await preview(page).tap();
      else {
        await row(page).locator('[data-column-key="body"]').focus();
        await page.keyboard.press("Enter");
      }
      await page.locator("#task-form").waitFor();
      await expect(page.locator('#task-form [name="body"]')).toHaveValue((await saved()).body);
      await expect(page.locator('[data-attachment-file="a-abc.txt"]')).toBeVisible();
      await page.locator('[data-action="dialog-close"]').click();
      await page.locator("#task-form").waitFor({ state: "detached" });
    }
    expect((await saved()).body).toBe(body);
  });

  test("editing a description uses the shared rich editor, keeps attachment links and reaches the CSV export", async ({ page, device }) => {
    await openTable(page, device);
    await preview(page).click();
    await page.locator("#task-form .inline-rich").fill("Updated description\nSecond line");
    await expect.poll(async () => (await saved()).body).toContain("Updated description");
    expect((await saved()).body).toMatch(/\[Notes\]\(\.\.\/attachments\/a-abc.txt\)/);
    await page.locator('[data-action="dialog-close"]').click();
    await expect(preview(page)).toContainText("Updated description");
    await page.waitForFunction(() => innerWidth > 600 || document.querySelector(".mobile-view-options .grid-tools"));
    const exportButton = await reveal(page.locator('[data-feature="table-export"]'));
    const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
    const csv = await fs.readFile(await download.path(), "utf8");
    expect(csv).toMatch(/Description/);
    expect(csv).toMatch(/Updated description/);
    expect(csv).toMatch(/attachments\/a-abc.txt/);
  });

  test("the Description column can be hidden, shown and moved, and keeps its place and width after reload", async ({ page, device }) => {
    await openTable(page, device);
    // Current column preferences keep the added field across reload.
    await reveal(page.locator('[data-column-visible="body"]'));
    await page.locator('[data-column-visible="body"]').uncheck();
    await expect(page.locator('thead th[data-column-key="body"]')).toHaveCount(0);
    await page.locator('[data-column-visible="body"]').check();
    await page.locator('[data-feature="columns-close"]').click();
    await page.locator('[data-column-drag="body"]').focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect.poll(async () => (await headers(page))[3]).toBe("body");
    const order = await headers(page);
    await expect(page.locator('[data-resize-column="body"]')).toHaveAttribute("aria-valuenow", "300");
    await page.reload();
    await row(page).waitFor();
    expect(await headers(page)).toEqual(order);
  });
});
