// Home's Web page panel (owner request T22): a page is checked once when chosen; one that allows
// framing shows in a sandboxed frame, one that forbids it shows a link card instead of a blank
// frame. The check refuses private addresses unless the server is told to allow them (here, for
// a page served on this machine).
import http from "node:http";
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";

let pages;
const app = useCustomApp({
  seed: async (store) => {
    const project = await store.createProject({ title: "Web lab" });
    pages = http.createServer((req, res) => {
      if (req.url.startsWith("/blocked")) res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("content-type", "text/html");
      res.end(`<html><head><title>${req.url.startsWith("/blocked") ? "Blocked page" : "Open page"}</title></head><body><h1 id="embedded">${req.url}</h1></body></html>`);
    });
    await new Promise((resolve) => pages.listen(0, "127.0.0.1", resolve));
    return { project, pagesBase: `http://127.0.0.1:${pages.address().port}` };
  },
  server: () => ({ home: { allowPrivate: true } }),
});
test.afterAll(() => new Promise((resolve) => pages?.close(resolve)));

async function choosePage(page, url) {
  await page.locator('.home-panel[data-type="web"] [data-board-menu^="panel-"] > summary').click();
  await page.locator('[data-home-panel-action="settings"]:visible').click();
  await page.locator('#home-panel-settings [name="url"]').fill(url);
  await page.locator('#home-panel-settings [type="submit"]').click();
  await expect(page.locator("#home-panel-settings")).toHaveCount(0);
}

test("an embeddable page shows in a sandboxed frame; one that forbids framing shows a link card", async ({ page }) => {
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  await page.evaluate(() => fetch("/api/home", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ panels: [{ id: "w", type: "web", x: 0, y: 0, w: 6, h: 6, settings: {} }] }) }));
  await page.reload();
  await page.locator('.home-panel[data-type="web"]').waitFor();
  await page.locator('[data-home="edit"]').click();
  await choosePage(page, `${app.pagesBase}/open`);
  const frame = page.locator(".home-web");
  await expect(frame).toHaveAttribute("sandbox", /allow-scripts/);
  await expect(page.frameLocator(".home-web").locator("#embedded")).toHaveText("/open");
  await expect(page.locator('.home-panel[data-type="web"] h2')).toHaveText("Open page");
  await choosePage(page, `${app.pagesBase}/blocked`);
  await expect(page.locator(".home-web")).toHaveCount(0);
  const card = page.locator(".home-link-card");
  await expect(card).toContainText("Blocked page");
  await expect(card).toHaveAttribute("href", `${app.pagesBase}/blocked`);
  await expect(card).toHaveAttribute("target", "_blank");
  // Editing the title keeps the link card (the page is still blocked).
  await page.locator('.home-panel[data-type="web"] [data-board-menu^="panel-"] > summary').click();
  await page.locator('[data-home-panel-action="settings"]:visible').click();
  await page.locator('#home-panel-settings [name="title"]').fill("News");
  await page.locator('#home-panel-settings [type="submit"]').click();
  await expect(page.locator("#home-panel-settings")).toHaveCount(0);
  await expect(page.locator(".home-link-card")).toContainText("News");
  await expect(page.locator(".home-web")).toHaveCount(0);
  // An unreachable page is reported, and the previous page stays.
  await page.locator('.home-panel[data-type="web"] [data-board-menu^="panel-"] > summary').click();
  await page.locator('[data-home-panel-action="settings"]:visible').click();
  await page.locator('#home-panel-settings [name="url"]').fill("http://127.0.0.1:1/");
  await page.locator('#home-panel-settings [type="submit"]').click();
  await expect(page.locator("#toasts")).toContainText("could not be reached");
  await expect(page.locator("#home-panel-settings")).toHaveCount(1);
});
