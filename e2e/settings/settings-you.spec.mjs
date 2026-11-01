// Owner request T40, 1 November 2026 (T78, audit B15): Settings → You puts Appearance first and lays
// out a setting with a one-line control as one row, its name on the left and the control on the
// right, like the other sections; phones stack the name above the control.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "You settings" }) }));

onDevices(["desktop", "ipad"], () => test("You starts with Appearance and keeps one-line settings on one row", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/settings/personal`);
  const panel = page.locator("#settings-panel");
  await panel.getByRole("combobox", { name: "Spacing" }).waitFor();
  const legends = await panel.locator("fieldset > legend").allTextContents();
  expect(legends[0], device).toBe("Appearance");
  expect(legends.indexOf("Workspace"), `${device}: Workspace after the appearance groups`).toBeGreaterThan(legends.indexOf("Display density"));
  for (const name of ["Spacing", "Navigation", "Add a command", "Project"]) {
    const control = panel.getByRole("combobox", { name, exact: true });
    const [field, box] = [await control.locator("xpath=ancestor::*[contains(concat(' ', @class, ' '), ' field ')][1]").boundingBox(), await control.boundingBox()];
    expect(box.x, `${device} ${name}: the control on the right`).toBeGreaterThan(field.x + field.width / 3);
    expect(box.height + 20, `${device} ${name}: one row`).toBeGreaterThanOrEqual(field.height);
  }
}));
