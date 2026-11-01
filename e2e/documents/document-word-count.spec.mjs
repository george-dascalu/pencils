// Word count from the UI review (owner request T40, 1 November 2026; T68): on phones and iPad the
// word count moves from the floating chip, which sat over the text above the bottom bar, into
// Document tools. Desktop keeps the chip.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Word count" });
  // One document per device: the touch runs type into theirs.
  const docs = {};
  for (const device of ["desktop", "phone", "ipad"]) docs[device] = await store.createDocument(project.id, { title: `Counted ${device}`, body: "one two three" });
  return { project, docs };
});
const count = "3 words · 13 characters";

onDevices(["desktop", "phone", "ipad"], () => test("the word count shows once: a chip on desktop, in Document tools on touch", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.docs[device].id}`);
  const chip = page.locator("[data-document-stats]");
  await expect(chip).toHaveText(count);
  await page.getByRole("button", { name: "Document tools", exact: true }).click();
  const tools = page.getByRole("dialog", { name: "Document tools" });
  await expect(tools).toBeVisible();
  if (device === "desktop") {
    await expect(chip).toBeVisible();
    await expect(tools.getByText(count)).toBeHidden();
  } else {
    await expect(chip).toBeHidden();
    await expect(tools.getByText(count)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" four");
    await page.getByRole("button", { name: "Document tools", exact: true }).click();
    await expect(tools.getByText("4 words · 18 characters"), "the count follows the text").toBeVisible();
  }
}));
