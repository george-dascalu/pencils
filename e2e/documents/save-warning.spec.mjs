// A board save the server refuses (here: more frames than the limit, from a
// browser draft) shows a compact warning in the header. Its details open on
// hover, focus, click or tap, close with Escape, stay on screen on phones, and
// offer Recovery & backups, where the draft exports even when server recovery is
// unavailable. Correcting the board saves it and clears the warning; an update
// notice keeps the version visible.
import fs from "node:fs/promises";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { BOARD_LIMITS } from "../../public/board-limits.js";
import { APP_VERSION } from "../../public/app-version.js";
import { axeViolations, setTheme } from "../helpers/documents.mjs";

const app = useApp(async (store, app) => ({
  namespace: (await (await fetch(`${app.base}/api/session`)).json()).user?.username || "shared",
}));
test.use({ viewportSize: { width: 1440, height: 1000 } });

// A project per test whose board has a browser draft one frame over the limit, waiting to save.
async function openWarning(page) {
  const project = await app.store.createProject({ title: "Save warning" });
  const board = (await app.store.snapshot(project.id)).boards[0];
  const frames = Array.from({ length: BOARD_LIMITS.frames + 1 }, (_, i) => ({ id: `frame-${i}`, type: "frame", text: `Frame ${i}`, x: i ? 10000 + (i % 100) * 200 : 100, y: 100 + Math.floor(i / 100) * 200, w: 160, h: 100 }));
  const pending = { url: `/projects/${project.id}/boards/${board.id}`, base: board, local: { ...board, nodes: frames, edges: [] }, generation: 1 };
  await page.addInitScript(({ pending, namespace, id }) => {
    sessionStorage.setItem("pencils:client", "tab-warning");
    localStorage.setItem(`pencils:pending:${namespace}:tab-warning`, JSON.stringify([pending]));
    localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 300, y: 180, z: 1 }));
  }, { pending, namespace: app.namespace, id: board.id });
  await page.goto(`${app.base}/#project/${project.id}/board/${board.id}`);
  await trigger(page).waitFor();
  await expect(trigger(page)).toHaveAttribute("aria-label", /Frame limit/);
  return { project, board };
}
const trigger = (page) => page.locator("#save-warning-toggle");
const details = (page) => page.locator("#save-warning-details");

test("the warning stays compact and opens on hover and focus, closing with Escape", async ({ page }) => {
  await openWarning(page);
  await expect(page.locator("#save-state .app-version")).toContainText(APP_VERSION);
  expect((await page.locator("#save-state").boundingBox()).width, "Header status stays compact").toBeLessThan(110);
  await expect(details(page)).toBeHidden();
  await trigger(page).hover();
  await expect(details(page)).toBeVisible();
  expect(await details(page).innerText()).toMatch(/10,001 frames.*10,000 frames/);
  expect(await details(page).innerText()).toMatch(/remove extra frames/);
  await details(page).hover();
  // Moving onto the popover must not start a close; nothing changes if it works.
  await page.waitForTimeout(250);
  await expect(details(page), "Popover remains readable while hovered").toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details(page)).toBeHidden();
  await page.mouse.move(10, 500);
  await trigger(page).focus();
  await expect(details(page)).toBeVisible();
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(details(page)).toBeHidden();
  await trigger(page).hover();
  await expect(details(page)).toBeVisible();
  expect((await axeViolations(page, "#save-state", null)).map((v) => v.id)).toEqual([]);
  // Both themes render the open details.
  await setTheme(page, "dark");
  await expect(details(page)).toBeVisible();
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });
  test("on phones a tap opens the details, which stay on screen", async ({ page }) => {
    await openWarning(page);
    await expect(trigger(page), "Save warning remains accessible on mobile").toBeVisible();
    await trigger(page).tap();
    await expect(details(page)).toBeVisible();
    const box = await details(page).boundingBox();
    expect(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, JSON.stringify(box)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(details(page)).toBeHidden();
  });
});

test("the browser draft exports even when server recovery is unavailable", async ({ page }) => {
  await openWarning(page);
  await page.mouse.move(10, 500);
  await trigger(page).click();
  await expect(details(page)).toBeVisible();
  // Browser drafts remain exportable even if server-only recovery data is unavailable.
  await page.route("**/api/trash", (route) => route.abort());
  await page.route("**/api/backups", (route) => route.abort());
  await details(page).getByRole("button", { name: "Recovery & backups" }).click();
  await page.getByRole("heading", { name: "Recovery & backups" }).waitFor();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export draft", exact: true }).click();
  const draft = JSON.parse(await fs.readFile(await (await download).path(), "utf8"));
  expect(draft.local.nodes).toHaveLength(BOARD_LIMITS.frames + 1);
  await page.locator('dialog [data-action="dialog-close"]').last().click();
});

test("removing the extra frame saves the board and clears the warning, and an update notice keeps the version", async ({ page }) => {
  const { project } = await openWarning(page);
  // Correct the real server validation failure; the old rejected operation must not recur.
  await page.locator('[data-node="frame-0"]').click({ position: { x: 5, y: 50 } });
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await app.store.snapshot(project.id)).boards[0].nodes.length, { timeout: 20000 }).toBe(BOARD_LIMITS.frames);
  await trigger(page).waitFor({ state: "hidden" });
  await page.route("**/api/health", (route) => route.fulfill({ json: { ok: true, version: "99.0.0" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText("Update available", { exact: true }).waitFor();
  await expect(page.locator("#save-state .app-version")).toContainText(APP_VERSION);
});
