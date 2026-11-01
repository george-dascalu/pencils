// Titles from the UI review (owner request T40, 1 November 2026; T70): a title too long for its space
// ends with an ellipsis, and hovering it shows the whole title.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const long = "Coordinate the quarterly supplier review with procurement, finance and the regional warehouse leads";
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Cut-off titles", key: "CT" });
  const card = await store.createTask(project.id, { title: long, start: "2026-11-02", due: "2026-11-06" });
  await store.createTask(project.id, { title: "Short" });
  return { project, card };
});
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
const cut = (locator) => locator.evaluate((el) => ({ ellipsis: getComputedStyle(el).textOverflow === "ellipsis", over: el.scrollWidth > el.clientWidth }));

test("a cut-off Table title ends with an ellipsis and shows in full on hover", async ({ page }) => {
  await page.goto(url("table"));
  const title = page.locator(`.spreadsheet input[data-task-field="title"][value^="Coordinate"]`);
  expect(await cut(title)).toEqual({ ellipsis: true, over: true });
  await title.hover();
  await expect(title).toHaveAttribute("title", long);
  const short = page.locator(`.spreadsheet input[data-task-field="title"][value="Short"]`);
  await short.hover();
  await expect(short, "a title that fits gets no tooltip").not.toHaveAttribute("title");
  const status = page.locator(".spreadsheet select").first();
  expect(await status.evaluate((el) => getComputedStyle(el).textOverflow), "other cells keep their own text").not.toBe("ellipsis");
});

onDevices(["desktop", "phone"], () => test("the card editor's title ends with an ellipsis and shows in full on hover", async ({ page }) => {
  await page.goto(url("list"));
  await page.locator(`[data-action="task-open"][data-id="${app.card.id}"]:visible`).first().click();
  const input = page.locator('#task-form [name="title"]');
  await input.waitFor();
  await input.blur();
  expect(await cut(input)).toEqual({ ellipsis: true, over: true });
  await input.hover();
  await expect(input).toHaveAttribute("title", long);
  await input.fill("Short again");
  await expect(input, "the tooltip goes once the title fits").not.toHaveAttribute("title");
  await input.fill(long);
  await input.evaluate((el) => (el.title = "Set by the app"));
  await page.mouse.move(0, 0);
  await input.hover();
  await expect(input, "a title the app set stays").toHaveAttribute("title", "Set by the app");
}));
