// T47: project settings combine. With each card field turned off in turn (T23), and with every
// field and most views off (T39), every view the project still offers opens without errors
// (the fixture fails a test on page, console and server errors) and shows its content.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { CARD_FIELDS, VIEW_GROUPS, viewOn } from "../../public/card-fields.js";

const app = useApp(async () => ({}));
const VIEWS = ["overview", ...VIEW_GROUPS.flatMap(([, , views]) => views)];
let count = 0;
// A project per test whose cards use every field: a parent and its child, dates, tags and an estimate.
async function seed(schema) {
  const project = await app.store.createProject({ title: `Combo ${++count}`, key: `CB${count}` });
  const parent = await app.store.createTask(project.id, { title: "Parent card", type: "epic", status: "in-progress", priority: "high", assignee: "Ann", start: "2026-11-02", due: "2026-11-06", estimate: 5, tags: ["alpha"] });
  await app.store.createTask(project.id, { title: "Child card", status: "todo", priority: "low", assignee: "Bo", due: "2026-11-04", parent: parent.id, tags: ["beta"] });
  await app.store.createDocument(project.id, { title: "Notes", body: "Some text.\n" });
  const { project: p } = await app.store.snapshot(project.id);
  await app.store.updateProject(project.id, { revision: p.revision, schema: { ...p.schema, ...schema } });
  return { project, config: { ...p.schema, ...schema } };
}
async function visitAll(page, { project, config }) {
  const shown = VIEWS.filter((view) => viewOn(config, view));
  for (const view of shown) {
    await page.goto(`${app.base}/#project/${project.id}/${view}`);
    await expect(page.locator("#view-content > *:visible").first(), view).toBeVisible();
    await expect(page.locator("#view-content"), `${view} opens`).not.toContainText("Opening view");
    await expect(page.locator("#view-content"), `${view} loads`).not.toContainText("This view could not load");
  }
  return shown;
}

for (const [field, name] of CARD_FIELDS)
  test(`with ${name} off, every view the project offers opens without errors`, async ({ page }) => {
    const shown = await visitAll(page, await seed({ off: [field] }));
    expect(shown.length).toBeGreaterThan(7);
  });

onDevices(["desktop", "phone"], () => test("with every card field and the Tasks views off, the rest still open without errors", async ({ page }) => {
  const seeded = await seed({ off: CARD_FIELDS.map(([key]) => key), views_off: ["list", "tree", "table", "kanban"] });
  expect(await visitAll(page, seeded)).toEqual(["overview", "board", "documents"]);
}));
