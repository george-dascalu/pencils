// Owner requests T92 and T93, 1 November 2026: Settings → Trash lists the project's deleted cards,
// documents and boards with when each goes for good (30 days), and restores them; Settings → Audit
// log lists who created, changed, deleted or restored each item, filtered by kind or a search.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage, showSettingsSection } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Records", key: "RE" });
  const card = await store.createTask(project.id, { title: "Deleted card" });
  await store.mutate(() => store.deleteTask(project.id, card.id, card.revision));
  // A deleted document in the personal space, whose Settings show You and Trash.
  const { project: personal } = await store.personalSpace(process.env.LOCAL_USER_NAME);
  const note = await store.createDocument(personal.id, { title: "Private note", body: "x" });
  await store.mutate(() => store.removeRecord(personal.id, "documents", note.id, note.revision));
  return { project, card, personal };
});
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/overview`);
  await page.locator("#view-content").waitFor();
};
// A change made through the API by the signed-in person (George).
const viaApi = (page, route, method, body) => page.evaluate(async ([route, method, body]) => {
  const response = await fetch(`/api${route}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response.json();
}, [route, method, body]);

onDevices(["desktop", "phone"], () => test("Trash lists a deleted card with when it goes for good, and restores it", async ({ page }) => {
  await open(page);
  await openSettingsPage(page, "trash");
  const row = page.locator(".settings-record-list li", { hasText: "Deleted card" });
  await expect(row).toContainText("deleted for good on");
  await expect(row.locator(".task-id")).toHaveText(app.card.key);
  await row.getByRole("button", { name: "Restore Deleted card" }).click();
  await expect(page.locator(".settings-record-list li", { hasText: "Deleted card" })).toHaveCount(0);
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.some((t) => t.id === app.card.id)).toBe(true);
  // It comes back to the Trash when deleted again (test isolation).
  const card = (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.card.id);
  await app.store.mutate(() => app.store.deleteTask(app.project.id, card.id, card.revision));
}));

test("the personal space's Settings have You and Trash, which lists its deleted documents", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.personal.id}/documents`);
  await page.locator("#view-content").waitFor();
  await openSettingsPage(page);
  await expect(page.locator(".settings-navigation [data-settings-section]")).toHaveCount(2);
  await showSettingsSection(page, "trash");
  await expect(page.locator(".settings-record-list li", { hasText: "Private note" })).toBeVisible();
});

test("the audit log lists who changed what, filtered by kind and search", async ({ page }) => {
  await open(page);
  const card = await viaApi(page, `/projects/${app.project.id}/tasks`, "POST", { title: "Audit me" });
  await viaApi(page, `/projects/${app.project.id}/tasks/${card.id}`, "PATCH", { revision: card.revision, status: "done" });
  await viaApi(page, `/projects/${app.project.id}/documents`, "POST", { title: "Minutes", body: "x" });
  await openSettingsPage(page, "audit");
  // Newest first; the Trash tests' restores come before.
  const rows = page.locator(".settings-record-list li");
  await expect(rows.nth(0)).toContainText("George created document Minutes");
  await expect(rows.nth(1)).toContainText("George edited card Audit me");
  await expect(rows.nth(1).locator("p")).toContainText("status");
  await expect(rows.nth(2)).toContainText("George created card Audit me");
  await page.locator("[data-audit-kind]").selectOption("document");
  await expect(rows).toHaveText([/Minutes/]);
  await page.locator("[data-audit-kind]").selectOption("");
  await page.locator("[data-audit-search]").fill("audit me");
  await expect(rows).toHaveCount(2);
  // The filters don't save anything.
  await expect(page.locator("[data-settings-save-state]")).not.toHaveText("Saving…");
});
