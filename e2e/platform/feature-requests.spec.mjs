// Feature requests panel (AGENTS.md: the owner's requests are tracked in the vault's
// feature-requests folder): opened from Help, it keeps focus through its first refresh,
// announces New request without opening the keyboard, keeps a closed draft with its
// attachment, submits with an image, records progress notes, stays inside the viewport
// on desktop and phone, survives a reload and reports the paused automatic queue.
// REQUEST_CAPTURE_DIR=<dir> saves screenshots of the panel.
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Request workspace" }) }));
const captures = process.env.REQUEST_CAPTURE_DIR;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOfoAAAAASUVORK5CYII=", "base64");

// The request files in the vault whose text includes the title.
async function savedRequests(title) {
  const root = path.join(app.root, "feature-requests");
  const names = (await fs.readdir(root).catch(() => [])).filter((name) => name.startsWith("fr-"));
  const bodies = await Promise.all(names.map((name) => fs.readFile(path.join(root, name, "request.md"), "utf8").catch(() => "")));
  return bodies.filter((body) => body.includes(title)).length;
}

async function openPanel(page, phone) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  if (phone) {
    await page.locator(".mobile-menu").click();
    await page.locator('.phone-drawer-utilities [data-action="help"]').click();
  } else await page.locator('.top-actions [data-action="help"]').click();
  await page.locator(".help-page-heading [data-feature-requests]").click();
  const panel = page.locator(".feature-requests-panel");
  await panel.locator('[data-request-action="new"]').waitFor();
  return panel;
}
async function newRequest(page, panel) {
  await panel.locator('[data-request-action="new"]').focus();
  await page.keyboard.press("Enter");
}

test.describe(() => {
  test.use({ viewportSize: { width: 1440, height: 1000 } });
  test("the panel keeps focus through its first refresh, and Refresh keeps focus when used by keyboard", async ({ page }) => {
    const panel = await openPanel(page, false);
    await expect(panel.locator('[data-request-action="close"]'), "Opening keeps focus after the initial refresh").toBeFocused();
    await panel.locator('[data-request-action="refresh"]').focus();
    const response = page.waitForResponse((r) => r.url().endsWith("/api/feature-requests") && r.request().method() === "GET");
    await page.keyboard.press("Enter");
    await response;
    await page.waitForFunction(() => document.activeElement?.dataset.requestAction === "refresh");
  });
});

onDevices(["desktop", "phone"], (device) => {
  if (device === "desktop") test.use({ viewportSize: { width: 1440, height: 1000 } });
  const phone = device === "phone";

  test("New request announces its heading without opening the keyboard", async ({ page }) => {
    const panel = await openPanel(page, phone);
    if (captures) {
      await fs.mkdir(captures, { recursive: true });
      await page.screenshot({ path: path.join(captures, `${page.viewportSize().width}-list.png`), fullPage: !phone });
    }
    await newRequest(page, panel);
    await expect(panel.locator("header h2"), "New request announces its heading without opening the keyboard").toBeFocused();
    if (phone) {
      const sizes = await panel.locator('input[name="title"]').evaluate((el) => ({ height: el.getBoundingClientRect().height, coarse: matchMedia("(pointer: coarse)").matches, token: getComputedStyle(el).getPropertyValue("--control-height") }));
      expect(sizes.height, JSON.stringify(sizes)).toBeGreaterThanOrEqual(44);
    }
    await expect(panel.locator('input[name="title"]'), "No automatic keyboard").not.toBeFocused();
  });

  test("a closed draft keeps its text and image, then submits, takes a progress note and survives a reload", async ({ page }) => {
    const viewport = page.viewportSize();
    const title = `Request from ${viewport.width}`;
    const panel = await openPanel(page, phone);
    await newRequest(page, panel);
    await panel.locator('[name="title"]').fill(title);
    await panel.locator('[name="body"]').fill("Make navigation clearer.\nPreserve the current editor.");
    await panel.locator('[type="file"]').setInputFiles({ name: "screenshot.png", mimeType: "image/png", buffer: png });
    if (captures) {
      await fs.mkdir(captures, { recursive: true });
      await page.screenshot({ path: path.join(captures, `${viewport.width}-form.png`), fullPage: !phone });
    }
    await panel.locator('[data-request-action="close"]').click();
    await page.locator(".help-page-heading [data-feature-requests]").click();
    await expect(panel.locator('[name="title"]'), "Closing preserves the draft and attachments").toHaveValue(title);
    await panel.locator('#feature-request-form [type="submit"]').click();
    await panel.locator(".request-detail").waitFor();
    await expect(panel.locator(".request-attachments img")).toHaveCount(1);
    const url = await panel.locator(".request-attachments a").getAttribute("href");
    expect((await page.request.get(app.base + url)).status()).toBe(200);
    await panel.locator('[name="note"]').fill("Keep the same spacing on iPad.");
    await panel.locator('#request-update-form [type="submit"]').click();
    await panel.getByText("Keep the same spacing on iPad.", { exact: true }).waitFor();
    if (captures) {
      if (phone) await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
      await page.screenshot({ path: path.join(captures, phone ? "mobile.png" : "desktop.png"), fullPage: !phone });
    }
    const bounds = await panel.boundingBox();
    expect(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, `panel ${JSON.stringify(bounds)}`).toBe(true);
    expect(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1, `panel ${JSON.stringify(bounds)}`).toBe(true);
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "Panel content fits").toBe(true);
    await page.keyboard.press("Escape");
    await page.reload();
    await page.locator(".help-page-heading [data-feature-requests]").click();
    await panel.getByText(title, { exact: true }).waitFor();
    await panel.locator('[data-request-action="automatic"]').click();
    await panel.getByText(/Automatic work is paused|Automatic worker is not connected/).waitFor();
    // The old suite counted two requests after both devices: one per submission, none from the draft.
    expect(await savedRequests(title), "one request saved in the vault").toBe(1);
  });
});
