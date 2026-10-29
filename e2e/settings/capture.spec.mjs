// Owner request, 29 October 2026 (note-taking research, idea 10): Settings → You makes the tokens an
// iPhone Shortcut uses to send text to a project as a card tagged "inbox", shows each one once, and
// revokes them.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => ({
  project: await store.createProject({ title: "Errands", key: "ER" }),
  other: await store.createProject({ title: "Work" }),
}));

onDevices(["desktop", "phone"], () => test("a capture token sends text to a project and can be revoked", async ({ page, request, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator('.main[data-layout-view="list"]').waitFor();
  await openSettingsPage(page, "personal");
  const box = page.getByRole("group", { name: "Capture from your phone" });
  await box.getByRole("combobox", { name: "Project" }).selectOption({ label: "Errands" });
  await box.getByRole("button", { name: "Make a capture token", exact: true }).click();
  const field = box.getByRole("textbox", { name: "New token, shown once" });
  await expect(field).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
  const token = await field.inputValue();
  await expect(field, "the keyboard stays down").not.toBeFocused();
  const row = box.locator("[data-capture-tokens] li", { hasText: "Errands" });
  await expect(row).toHaveCount(1);
  await box.locator("summary", { hasText: "Set up the Shortcut" }).click();
  await expect(box.locator(".capture-steps")).toContainText(`${app.base}/api/capture`);

  const title = `Buy stamps ${device}`;
  const sent = await request.post(`${app.base}/api/capture`, { headers: { Authorization: `Bearer ${token}` }, data: { text: `${title} #post\nAt the corner shop` } });
  expect(sent.status()).toBe(201);
  const card = (await app.store.children(app.project.id, "tasks")).items.find((t) => t.title === title);
  expect(card.tags).toEqual(["post", "inbox"]);

  await row.getByRole("button", { name: "Revoke the token for Errands", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect((await request.post(`${app.base}/api/capture`, { headers: { Authorization: `Bearer ${token}` }, data: { text: "Too late" } })).status()).toBe(401);
}));
