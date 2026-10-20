import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { helpArticles } from "../public/help-content.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-help-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Help workspace" });
await store.createTask(project.id, { title: "Keep this filter" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  externalRequests = [],
  mutations = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
page.on("request", (r) => {
  if (r.url().startsWith("http") && !r.url().startsWith(base))
    externalRequests.push(r.url());
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
    !r.url().endsWith("/presence")
  )
    mutations.push(r.url());
});
async function title(text) {
  await page.waitForFunction(
    (s) => document.querySelector("#help-title")?.textContent === s,
    text,
  );
}
try {
  await page.goto(`${base}/#project/${project.id}/table`);
  await page.locator(".spreadsheet").waitFor();
  await page.locator("#search").fill("Keep this filter");
  await page.locator('.top-actions [data-action="help"]').click();
  await title("Help & guides");
  assert.equal(
    await page.locator("dialog").count(),
    0,
    "Help is a page, not a modal",
  );
  assert.equal(new URL(page.url()).hash, "#help/start");
  await page.goBack();
  await page.locator(".spreadsheet").waitFor();
  assert.equal(
    await page.locator("#search").inputValue(),
    "Keep this filter",
    "Back restores the filtered project",
  );
  await page.goForward();
  await title("Help & guides");

  await page.locator("#help-search").fill("Files.Read.All");
  assert.equal(
    await page.locator("#help-navigation a:not([hidden])").count(),
    1,
  );
  await page.locator("#help-search").press("Enter");
  await title("SharePoint Excel");
  assert.equal(
    await page
      .locator("#help-title")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator('[data-help-section="identifiers"]').click();
  assert.equal(
    await page
      .locator("#help-section-identifiers")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.ok(await page.evaluate(() => scrollY > 0));
  await page.locator('#help-navigation [data-id="jira"]').click();
  await title("Jira Cloud");
  await page.locator('[data-action="help-back"]').click();
  await title("SharePoint Excel");
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.evaluate(() => location.reload()),
  ]);
  await title("SharePoint Excel");
  assert.equal(new URL(page.url()).hash, "#help/excel");

  await page.locator("#help-search").fill("zznomatch");
  assert.match(
    await page.locator("#help-search-status").innerText(),
    /No guides found/,
  );
  await page.locator("#help-search").press("Escape");
  assert.equal(
    await page.locator("#help-navigation a:not([hidden])").count(),
    helpArticles.length,
  );
  for (const article of helpArticles) {
    await page.locator(`#help-navigation [data-id="${article.id}"]`).click();
    await title(article.title);
    assert.equal(
      await page.locator(".help-section h2").count(),
      article.sections.length,
    );
    for (const href of await page
      .locator('.help-article a[href^="#help/"]')
      .evaluateAll((links) => links.map((a) => a.hash)))
      assert.ok(
        helpArticles.some((a) => href === `#help/${a.id}`),
        `Working article link: ${href}`,
      );
  }
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      // Direct links also work in a fresh browser tab with no project selected.
      await page.goto(`${base}/#help/obsidian`);
      await title("Obsidian");
      await page.locator("#help-search").fill("SharePoint Excel");
      assert.ok(
        await page.locator('#help-navigation [data-id="excel"]').isVisible(),
        "Mobile search reveals article links",
      );
      await page.locator('#help-navigation [data-id="excel"]').click();
      await title("SharePoint Excel");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "No horizontal page overflow",
      );
      const accessibility = await new AxeBuilder({ page })
        .include(".help-page")
        .analyze();
      if (accessibility.violations.length)
        console.log(
          JSON.stringify(
            accessibility.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                reason: n.failureSummary,
              })),
            })),
            null,
            2,
          ),
        );
      assert.deepEqual(
        accessibility.violations.map((v) => `${v.id}: ${v.description}`),
        [],
        "Accessible help page",
      );
      await page.screenshot({
        path: `/tmp/pencils-help-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
  }
  assert.deepEqual(
    externalRequests,
    [],
    "Help loads entirely from the local server",
  );
  assert.deepEqual(
    mutations,
    [],
    "Reading help changes no project data or integrations",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: wiki Help from header, all articles, full-text search, contents, keyboard focus, Back/Forward, filters, reload/deep links, mobile/themes/accessibility and no external requests or data changes.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
