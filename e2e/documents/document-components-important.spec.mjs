// Inline document components (see document-components.spec.mjs): the workspace passes accessibility
// checks on desktop and phone widths in both themes. Split by tier (F0.22-21).
import { test, expect, useApp } from "../fixtures.mjs";
import { axeViolations, noHorizontalScroll, setTheme } from "../helpers/documents.mjs";

const body = [
  "# Notebook", "", "Keep **this paragraph** exactly as written.", "",
  "> [!note]+ Remember", "> A **formatted** callout with $x^2$. %%Private comment%%", "",
  "| Name | State |", "| :--- | ---: |", "| Editor | Ready |", "",
  "> An ordinary quote.", "",
  "```javascript", "const answer = 42;", "```", "",
  "$$", "x^2", "$$", "", "Untouched ending with [[Notebook|alias]].", "",
].join("\n");
const app = useApp(async (store) => ({ project: await store.createProject({ title: "Inline components" }) }));
test.use({ viewportSize: { width: 1440, height: 1050 } });
const textbox = (page, name) => page.getByRole("textbox", { name, exact: true });

test("components stay accessible at desktop and phone widths in both themes", async ({ page }) => {
  const record = await app.store.createDocument(app.project.id, { title: "Notebook", body });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);
  await textbox(page, "Callout content").waitFor();
  const saved = async () => (await app.store.getDocument(app.project.id, record.id)).body;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      await textbox(page, "Callout title").fill(`Heading ${width} ${theme}`);
      await expect.poll(saved).toContain(`Heading ${width} ${theme}`);
      expect(await axeViolations(page, ".documents-workspace"), `${width} ${theme}`).toEqual([]);
      expect(await noHorizontalScroll(page), `${width} ${theme} fits`).toBe(true);
    }
  }
});
