// Owner request, 29 October 2026 (note-taking research, idea 2): live task queries. A ```tasks
// block in a document lists the project's matching cards, using a subset of the Obsidian
// Tasks plugin's syntax; ticking a row completes the card and clicking it opens the card.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { editorSource, openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Queries", key: "TQ" }) }));
const status = async (id) => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === id).status;

onDevices(["desktop", "phone"], () => test("a tasks block lists matching cards live, and ticking one completes it", async ({ page, device }) => {
  // Each device works on its own cards.
  const outage = await app.store.createTask(app.project.id, { title: `Fix the outage ${device}`, priority: "urgent" });
  await app.store.createTask(app.project.id, { title: `Tidy the wiki ${device}`, priority: "low" });
  await openNewDocument(page, app, app.project.id, { body: `Plan\n\n\`\`\`tasks\nnot done\ntitle includes ${device}\nsort by priority\n\`\`\`\n\nAfter.` });
  const rows = page.locator(".cm-content [data-document-task-query] .document-task-row");
  await expect(rows).toHaveText([/Fix the outage/, /Tidy the wiki/]);
  await expect(rows.first().getByRole("img", { name: "Priority: Urgent" })).toBeVisible();
  // Phones tap, which must not focus the editor (and open the keyboard).
  const box = rows.first().getByRole("checkbox", { name: `Done: Fix the outage ${device}` });
  await (device === "phone" ? box.tap() : box.click());
  await expect.poll(() => status(outage.id)).toBe("done");
  if (device === "phone") expect(await page.evaluate(() => !document.activeElement?.closest(".cm-content")), "the tap leaves the editor unfocused").toBe(true);
  await expect(rows, "a completed card leaves a 'not done' list").toHaveText([/Tidy the wiki/]);
  await rows.first().getByRole("button", { name: /Tidy the wiki/ }).click();
  await expect(page.locator("#task-form [name=title]")).toHaveValue(`Tidy the wiki ${device}`);
}));

test("reading shows the same list, and unknown instructions are reported in the block", async ({ page }) => {
  await app.store.createTask(app.project.id, { title: "Reading card" });
  await openNewDocument(page, app, app.project.id, { body: "```tasks\ntitle includes Reading card\ndue someday\n```" });
  await expect(page.locator(".cm-content [data-document-task-query]")).toContainText("Not understood: due someday");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".document-reading .document-task-row")).toHaveText([/Reading card/]);
});

test("the / menu inserts a starter task query", async ({ page }) => {
  await openNewDocument(page, app, app.project.id, { body: "Intro.\n\n" });
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("/task query");
  await page.locator(".cm-tooltip-autocomplete li[role=option]").filter({ hasText: "Task query" }).click();
  await expect.poll(() => editorSource(page)).toContain("```tasks\nnot done\nsort by due\n```");
});
