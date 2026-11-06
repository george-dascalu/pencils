// Removing attachments (F0.22-33): each attachment of a card's description or of a note has a
// remove button that asks first, then takes every link to that file out of the text, leaving the
// rest of it as it was. The file itself stays, as earlier versions of the card still link to it.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Removing" }) }));
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === id);
const IMAGE = "![shot.png](../attachments/a-0000aaaa.png)", TEXT = "[notes.txt](../attachments/a-1111bbbb.txt)";
async function open(page, card) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(page.locator("#task-form")).toBeVisible();
}

test("removing takes every link to that one file out of the text and leaves the rest", async ({ page }) => {
  await page.goto(app.base);
  const out = await page.evaluate(async ({ project, IMAGE, TEXT }) => {
    const { removeTaskAttachment } = await import("/task-attachment-model.js");
    const source = `Intro with ${IMAGE} inline.\n\n${IMAGE}\n\n- item ${IMAGE}\n\n\`\`\`md\n${IMAGE}\n\`\`\`\n\n${TEXT}\n\n${IMAGE}\n`;
    return { source, out: removeTaskAttachment(source, project, "a-0000aaaa.png"), none: removeTaskAttachment(source, project, "a-9999.png") };
  }, { project: app.project.id, IMAGE, TEXT });
  // Blank lines left behind render as one break, so runs of them count as one here.
  expect(out.out.replace(/\n{3,}/g, "\n\n")).toBe(`Intro with  inline.\n\n- item \n\n\`\`\`md\n${IMAGE}\n\`\`\`\n\n${TEXT}\n\n`);
  expect(out.none, "another file leaves the text alone").toBe(out.source);
});

test("removing finds the link itself, not its text in code or around another link, and drops its reference", async ({ page }) => {
  await page.goto(app.base);
  const out = await page.evaluate(async ({ project, IMAGE, TEXT }) => {
    const { removeTaskAttachment } = await import("/task-attachment-model.js");
    const wrapped = `[${IMAGE}](../attachments/a-1111bbbb.txt)`;
    return [
      removeTaskAttachment(`Use \`${IMAGE}\` then ${IMAGE} here.\n`, project, "a-0000aaaa.png"),
      removeTaskAttachment(`Open ${wrapped} now.\n`, project, "a-1111bbbb.txt"),
      removeTaskAttachment(`See [the shot][s].\n\n[s]: ../attachments/a-0000aaaa.png\n\n${TEXT}\n`, project, "a-0000aaaa.png"),
    ];
  }, { project: app.project.id, IMAGE, TEXT });
  expect(out[0], "the code example stays").toBe(`Use \`${IMAGE}\` then  here.\n`);
  expect(out[1], "a link around an image goes whole").toBe("Open  now.\n");
  expect(out[2].replace(/\n{3,}/g, "\n\n"), "its reference goes too").toBe(`See .\n\n${TEXT}\n`);
});

test("a card's attachment is removed after confirming, and Cancel keeps it", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Remove from card", body: `Card text\n\n${IMAGE}\n\n${TEXT}\n` });
  await open(page, card);
  const list = page.locator("#task-form .task-description .task-attachments");
  const remove = list.getByRole("button", { name: "Remove shot.png", exact: true });
  await remove.click();
  const confirm = page.getByRole("alertdialog", { name: "Remove attachment?" });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(list.getByRole("button", { name: "Preview shot.png", exact: true })).toBeVisible();
  await remove.click();
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(list.getByRole("button", { name: "Preview shot.png", exact: true })).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Remove notes.txt", exact: true }), "focus moves to the next one").toBeFocused();
  await expect.poll(async () => (await saved(card.id)).body).not.toContain("a-0000aaaa.png");
  const body = (await saved(card.id)).body;
  expect(body).toContain("Card text");
  expect(body).toContain(TEXT);
  // The last one gone, focus goes to Add attachments.
  await list.getByRole("button", { name: "Remove notes.txt", exact: true }).click();
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(list.getByRole("button", { name: "Add attachments", exact: true })).toBeFocused();
  await expect.poll(async () => (await saved(card.id)).body).not.toContain("a-1111bbbb.txt");
});

test("a note's attachment is removed while reading it, leaving the card's own", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Remove from note", body: `Card\n\n${IMAGE}\n`, notes: [{ id: "n-files", body: `Read me\n\n${TEXT}\n` }] });
  await open(page, card);
  const notes = page.getByRole("region", { name: "Notes", exact: true });
  await notes.getByRole("button", { name: "Remove notes.txt", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Remove attachment?" }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(notes.locator(".task-attachments")).toBeHidden();
  await expect(notes.getByRole("button", { name: "Attach files to note", exact: true }), "focus goes to Attach files").toBeFocused();
  await expect.poll(async () => (await saved(card.id)).notes?.[0]?.body).not.toContain("a-1111bbbb.txt");
  expect((await saved(card.id)).notes[0].body).toContain("Read me");
  expect((await saved(card.id)).body).toContain(IMAGE);
});
