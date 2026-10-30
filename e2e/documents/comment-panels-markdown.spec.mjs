// Board comments and card descriptions: the comments panel resizes with the
// pointer and the keyboard, keeps its size and draft when reopened, and its
// formatting toolbar stays on one row (44px targets on touch screens). Markdown
// typed or pasted into a card description becomes formatting, pasted HTML is
// cleaned, and the saved card shows headings, emphasis, tables, checklists,
// highlights and code.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { axeViolations, setTheme } from "../helpers/documents.mjs";

const app = useApp();
test.use({ viewportSize: { width: 1500, height: 1000 } });

// A project per test with one expanded task card on its board.
async function seed() {
  const project = await app.store.createProject({ title: "Formatted cards" });
  const task = await app.store.createTask(project.id, { title: "Collect inspiration & early ideas", body: "Original description" });
  let board = (await app.store.snapshot(project.id)).boards[0];
  board = await app.store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card", type: "task", task: task.id, x: 100, y: 100, w: 440, h: 550, taskCollapsed: false }], edges: [] });
  const saved = async () => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === task.id);
  return { url: `${app.base}/#project/${project.id}/board/${board.id}`, saved };
}
// Since 0.19.0 touch screens get 44px comment formatting targets with 16px icons; pointers keep the compact 13px icons.
async function oneLine(panel, { icon = 13, target = 0 } = {}) {
  const positions = await panel.locator(".comment-rich-tools button:visible,.comment-rich-tools summary:visible").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
  expect(Math.max(...positions) - Math.min(...positions), `Toolbar wraps: ${positions}`).toBeLessThan(4);
  const icons = await panel.locator(".comment-rich-tools button:visible > .icon").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(icons.every((width) => width <= icon), `Toolbar icons: ${icons}`).toBe(true);
  if (target) {
    const sizes = await panel.locator(".comment-rich-tools button:visible:not(.rich-scroll),.comment-rich-tools summary:visible").evaluateAll((els) => els.map((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)));
    expect(sizes.every((size) => size >= target - 0.5), `Touch targets: ${sizes}`).toBe(true);
  }
}
// Pastes clipboard data of the given type into the focused rich editor.
const paste = (rich, type, data) => rich.evaluate((el, [type, data]) => {
  el.focus();
  const clipboardData = new DataTransfer();
  clipboardData.setData(type, data);
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: clipboardData });
  el.dispatchEvent(event);
}, [type, data]);
async function openDescription(page) {
  await page.locator("[data-node=card] [data-pro=task-details]").click();
  const rich = page.locator("#task-form .task-description .inline-rich");
  await rich.fill("");
  return rich;
}

test("the comments panel resizes by pointer and keyboard, keeping its size and draft", async ({ page }) => {
  const { url } = await seed();
  await page.goto(url);
  const card = page.locator("[data-node=card]");
  await card.locator("[data-pro=comments]").click();
  const panel = page.locator(".board-comments");
  await oneLine(panel);
  await expect(panel.locator(".board-comments-object")).toHaveCount(0);
  const grip = panel.getByRole("button", { name: "Resize comments", exact: true }), start = await panel.boundingBox(), handle = await grip.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + handle.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  const rect = await panel.boundingBox();
  expect(rect.width).toBeGreaterThanOrEqual(start.width + 119);
  expect(rect.height).toBeGreaterThanOrEqual(start.height + 79);
  await grip.focus();
  await grip.press("ArrowLeft");
  expect((await panel.boundingBox()).width).toBeLessThan(rect.width);
  await oneLine(panel);
  await panel.getByRole("textbox", { name: "Comment", exact: true }).fill("A draft survives resizing");
  await panel.getByRole("button", { name: "Close comments", exact: true }).click();
  await card.locator("[data-pro=comments]").click();
  expect(await panel.getByRole("textbox", { name: "Comment", exact: true }).innerText()).toBe("A draft survives resizing");
  expect((await panel.boundingBox()).width).toBeGreaterThan(start.width + 90);
  await panel.locator(".rich-format-menu > summary").click();
  await panel.getByRole("button", { name: "Heading 2", exact: true }).click();
  await expect(panel.locator(".inline-rich h2")).toHaveText("A draft survives resizing");
});

test("Markdown typed into a card description becomes formatting", async ({ page }) => {
  const { url } = await seed();
  await page.goto(url);
  const rich = await openDescription(page);
  await rich.pressSequentially("# Heading typed");
  await expect(rich.locator("h1")).toHaveText("Heading typed");
  for (const [text, selector, expected] of [["**Bold**", "strong,b", "Bold"], ["*Italic*", "em,i", "Italic"], ["***Both***", "strong em,em strong,b i,i b", "Both"], ["==Highlight==", "mark", "Highlight"], ["~~Removed~~", "del,s,strike", "Removed"], ["`code`", "code", "code"]]) {
    await rich.fill("");
    await rich.pressSequentially(text);
    await expect(rich.locator(selector), text).toHaveText(expected);
  }
  await rich.fill("");
  await rich.pressSequentially("\\*Literal\\*");
  await expect(rich).toContainText("Literal");
  await expect(rich.locator("em,i"), "escaped asterisks stay literal").toHaveCount(0);
});

test("pasted HTML keeps its formatting without executable attributes", async ({ page }) => {
  const { url } = await seed();
  await page.goto(url);
  const rich = await openDescription(page);
  // Rich clipboard HTML keeps formatting while removing executable attributes.
  await paste(rich, "text/html", '<p><strong>Clipboard</strong> <img src=x onerror="window.clipboardUnsafe=true"><a href="javascript:alert(1)">unsafe link</a></p>');
  await expect(rich.locator("strong,b")).toHaveText("Clipboard");
  await expect(rich.locator('[onerror],a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.clipboardUnsafe)).toBeUndefined();
});

test("pasted Markdown saves, and the card shows its headings, tables, checklists, highlights and code", async ({ page }) => {
  const { url, saved } = await seed();
  await page.goto(url);
  const rich = await openDescription(page);
  const source = "# Heading\n\n## Details\n\n**Bold**, *italic*, ***both***, ~~removed~~, ==highlighted== and `code`.\n\n- [ ] Unchecked\n- [x] Checked\n\n| Item | State |\n| --- | --- |\n| Idea | Ready |\n\n> A quotation\n\n```js\nconst safe = true;\n```\n\n\\*Literal asterisks\\*";
  await paste(rich, "text/plain", source);
  await expect(rich.locator("h1")).toHaveText("Heading");
  await expect(rich.locator("table td")).toHaveCount(2);
  await expect(rich.locator("mark")).toHaveText("highlighted");
  await expect.poll(async () => { const t = await saved(); return t.body.includes("==highlighted==") && t.body.includes("# Heading") && !t.body.includes("\\# Heading"); }).toBe(true);
  await page.locator("#task-form [data-action=dialog-close]").click();
  const description = page.locator("[data-node=card] .task-card-description");
  await description.locator("h1").waitFor();
  await expect(description.locator("h2")).toHaveText("Details");
  await expect(description.locator("table td")).toHaveCount(2);
  await expect(description.locator("input[type=checkbox]")).toHaveCount(2);
  await expect(description.locator("mark")).toHaveText("highlighted");
  expect(await description.locator("pre code").innerText()).toBe("const safe = true;\n");
  expect(await description.innerText()).toMatch(/\*Literal asterisks\*/);
  const sizes = await description.evaluate((el) => ({ h1: parseFloat(getComputedStyle(el.querySelector("h1")).fontSize), body: parseFloat(getComputedStyle(el).fontSize) }));
  expect(sizes.h1, `headings are larger than body text ${JSON.stringify(sizes)}`).toBeGreaterThan(sizes.body);
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });
  test("on phones the comments toolbar keeps one row of 44px targets, accessible and on screen in both themes", async ({ page }) => {
    const { url } = await seed();
    await page.goto(url);
    // The board opens at the default 85% camera, where this 440px-wide card's Comments button sits past a 390px screen; fit the board first.
    await page.locator("#zoom-label").dblclick();
    await page.locator("[data-node=card] [data-pro=comments]").click();
    const panel = page.locator(".board-comments");
    await oneLine(panel, { icon: 16, target: 44 });
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      expect((await axeViolations(page, ".board-comments")).map((v) => v.id), theme).toEqual([]);
      const rect = await panel.boundingBox();
      expect(rect.x >= 0 && rect.x + rect.width <= 390, `${theme} ${JSON.stringify(rect)}`).toBe(true);
    }
  });
});
