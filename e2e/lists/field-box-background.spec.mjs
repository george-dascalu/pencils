// Owner feedback, 2 November 2026: Status and Priority must not paint full-height
// backgrounds outside the shared field box in List and Tree.
import { test, expect, onDevices } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";

const app = useCustomApp({ server: () => ({ productionAssets: true }), seed: async (store) => {
  const project = await store.createProject({ title: "Field backgrounds", key: "BG" });
  const task = await store.createTask(project.id, { title: "Check field backgrounds", assignee: "George", status: "todo", priority: "medium", due: "2026-11-05" });
  return { project, task };
} });

onDevices(["desktop", "ipad", "phone"], () => {
  for (const view of ["list", "tree"]) test(`${view} field targets leave the background to their shared box @gate`, async ({ page, device }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    const row = page.locator(`[data-task-order-row="${app.task.id}"]`);
    await expect(row).toBeVisible();
    const box = row.locator(device === "phone" ? ".phone-task-fields" : ".row-fields");
    await expect(box).toBeVisible();
    for (const look of ["default", "paper", "minimal", "catppuccin", "typewriter"]) {
      for (const theme of ["light", "dark"]) {
        await page.evaluate((settings) => window.PencilsAppearance.write(settings), { look, theme });
        const paint = await box.evaluate((el) => [...el.children].map((field) => {
          const cs = getComputedStyle(field), line = getComputedStyle(field, "::before");
          return { name: field.className, bg: cs.backgroundColor, image: cs.backgroundImage, shadow: cs.boxShadow, line: { content: line.content, width: line.width, height: line.height, top: line.top, bg: line.backgroundColor }, height: field.clientHeight, chipHeight: parseFloat(getComputedStyle(el).getPropertyValue("--list-field-height")) };
        }));
        for (const [index, field] of paint.entries()) {
          expect(field.bg, `${look}/${theme}: ${field.name} target fill`).toBe("rgba(0, 0, 0, 0)");
          expect(field.image, `${look}/${theme}: ${field.name} target image`).toBe("none");
          expect(field.shadow, `${look}/${theme}: ${field.name} target has no inset separator shadow`).toBe("none");
          if (device !== "phone" && index > 0) {
            expect(field.line.content).toBe('""');
            expect(field.line.width).toBe("1px");
            expect(parseFloat(field.line.height)).toBeLessThanOrEqual(field.chipHeight);
            expect(parseFloat(field.line.top)).toBeGreaterThanOrEqual((field.height - field.chipHeight) / 2);
            expect(parseFloat(field.line.top) + parseFloat(field.line.height)).toBeLessThanOrEqual((field.height + field.chipHeight) / 2);
            expect(field.line.bg).not.toBe("rgba(0, 0, 0, 0)");
          }
        }
      }
    }
  });
});
