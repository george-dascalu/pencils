// Owner request, 28 October 2026: code blocks in documents show syntax colours,
// and a block's language is chosen from a menu instead of editing the fence.
// Colours are painted with the CSS Custom Highlight API, so the code stays
// plain editable text.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { editorSource, openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Code", key: "CO" }) }));
const body = "# Code\n\nIntro.\n\n```js\nfunction greet(name) {\n  // say hello\n  return \"Hi \" + name + 42;\n}\n```\n\nAfter.\n";
const open = (page, text = body) => openNewDocument(page, app, app.project.id, { body: text, waitFor: '.document-editable-component[data-component-type="code"]' });
// Text painted by each code highlight, keyed by group.
const painted = (page, scope) => page.evaluate((scope) => {
  const out = {};
  for (const [name, highlight] of CSS.highlights) {
    if (!name.startsWith("document-code-")) continue;
    out[name.slice("document-code-".length)] = [...highlight].filter((range) => range.startContainer.isConnected && range.startContainer.parentElement?.closest(scope)).map((range) => range.toString());
  }
  return out;
}, scope);
const picker = (page) => page.locator(".document-codemirror .document-code-language");

onDevices(["desktop", "phone"], () => {
  test("a JavaScript block is coloured in live preview", async ({ page }) => {
    await open(page);
    await page.waitForFunction(() => CSS.highlights.get("document-code-keyword")?.size > 0);
    const p = await painted(page, ".document-codemirror");
    expect(p.keyword, "keywords").toEqual(expect.arrayContaining(["function", "return"]));
    expect(p.string?.some((s) => s.includes("Hi")), `strings ${JSON.stringify(p)}`).toBe(true);
    expect(p.comment?.some((s) => s.includes("say hello")), `comments ${JSON.stringify(p)}`).toBe(true);
    expect(p.number, "numbers").toContain("42");
    // The code is still plain text: no markup was added to colour it.
    await expect(page.locator(".document-codemirror pre code *")).toHaveCount(0);
  });

  test("the language menu names the block's language and changes the fence", async ({ page }) => {
    await open(page);
    await expect(picker(page)).toHaveValue("js");
    expect(await picker(page).evaluate((el) => el.selectedOptions[0].textContent)).toMatch(/JavaScript/);
    await picker(page).selectOption("python");
    await expect.poll(() => editorSource(page), "the fence names the new language").toMatch(/```python\nfunction greet/);
    expect(await editorSource(page)).not.toMatch(/```js/);
    // Python colours its own keywords: "return" still, "function" no longer.
    await page.waitForFunction(() => [...(CSS.highlights.get("document-code-keyword") || [])].some((r) => r.toString() === "return"));
    const p = await painted(page, ".document-codemirror");
    expect(p.keyword, "function is not a Python keyword").not.toContain("function");
    // Plain text removes the colours and the fence's language.
    await picker(page).selectOption("");
    await expect.poll(() => editorSource(page)).toMatch(/```\nfunction greet/);
    await expect.poll(async () => (await painted(page, ".document-codemirror")).keyword || []).toEqual([]);
  });
});

test("a fence written as an alias selects that language in the menu", async ({ page }) => {
  await open(page, body.replace("```js", "```javascript"));
  const state = await picker(page).evaluate((el) => ({ label: el.selectedOptions[0].textContent, options: [...el.options].map((o) => o.textContent) }));
  expect(state.label).toBe("JavaScript");
  expect(state.options.filter((o) => /javascript/i.test(o)), "no duplicate entry").toHaveLength(1);
  expect(await editorSource(page), "the fence is left as written until a language is chosen").toMatch(/```javascript\n/);
});

test("editing the code keeps colouring it", async ({ page }) => {
  await open(page);
  const code = page.locator(".document-codemirror pre code");
  await code.click();
  await expect(code, "a click focuses the code").toBeFocused();
  // Caret at the end of the code.
  await code.evaluate((el) => { const range = document.createRange(); range.selectNodeContents(el); range.collapse(false); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await page.keyboard.press("Enter");
  await page.keyboard.type("const later = true;");
  await page.waitForFunction(() => [...(CSS.highlights.get("document-code-keyword") || [])].some((r) => r.toString() === "const"));
  await expect.poll(() => editorSource(page)).toMatch(/const later = true;\n```/);
});

test("reading mode shows the same colours", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await page.locator(".document-reading").waitFor();
  await page.waitForFunction(() => [...(CSS.highlights.get("document-code-keyword") || [])].some((r) => r.startContainer.parentElement?.closest(".document-reading") && r.toString() === "function"));
});
