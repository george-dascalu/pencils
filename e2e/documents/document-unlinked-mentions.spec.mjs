// Owner request, 29 October 2026 (note-taking research, idea 9): unlinked mentions, as in
// Obsidian. A document's tools list other documents that name it without linking, with Link;
// a card's Documents section lists the documents that mention its key.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Unlinked", key: "UM" });
  const card = await store.createTask(project.id, { title: "Ship the release" });
  const log = await store.createDocument(project.id, { title: "Release log", body: `Waiting on ${card.key}.` });
  const plan = await store.createDocument(project.id, { title: "Plan", body: `Next: [[${card.key}]].` });
  return { project, card, log, plan };
});
const tools = (page) => page.getByRole("button", { name: "Document tools", exact: true });

onDevices(["desktop", "phone"], () => test("document tools list unlinked mentions, and Link turns them into links", async ({ page, device }) => {
  // Each device links its own pair of documents.
  const brief = await app.store.createDocument(app.project.id, { title: `Launch brief ${device}`, body: "Goals." });
  const notes = await app.store.createDocument(app.project.id, { title: `Meeting notes ${device}`, body: `We read the launch brief ${device} twice. Launch Brief ${device} again.` });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${brief.id}`);
  await page.locator(".cm-content").waitFor();
  await tools(page).click();
  await expect(page.getByRole("heading", { name: "Unlinked mentions (1)" })).toBeVisible();
  await expect(page.locator(".document-mention-context"), "the mention shows in context").toContainText(`read the launch brief ${device} twice`);
  await page.getByRole("button", { name: `Link mentions in Meeting notes ${device}`, exact: true }).click();
  const reference = (await app.store.getDocument(app.project.id, brief.id)).file.replace(/\.md$/, "");
  await expect.poll(async () => (await app.store.getDocument(app.project.id, notes.id)).body)
    .toBe(`We read the [[${reference}|launch brief ${device}]] twice. [[${reference}|Launch Brief ${device}]] again.`);
  await tools(page).click();
  await expect(page.getByRole("heading", { name: "Unlinked mentions (0)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backlinks (1)" })).toBeVisible();
}));

onDevices(["desktop", "phone"], () => test("the card editor lists documents that mention its key, linked or not", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator('.task-row [data-action="task-open"]:visible').first().click();
  const mentions = page.locator("#task-form [data-document-mentions]");
  await expect(mentions.getByRole("button")).toHaveText([/Plan/, /Release log.*Not linked/]);
  await mentions.getByRole("button", { name: /Release log/ }).click();
  await expect(page).toHaveURL(new RegExp(`/documents/${app.log.id}$`));
}));
