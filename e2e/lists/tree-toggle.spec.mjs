// Owner request (F0.21-81, 3 November 2026): the arrow on a Tree row with children was a small,
// faint chevron. It is now a round button with a bold chevron in the text colour; rows without
// children keep an empty spacer.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Toggles", key: "TG" });
  const parent = await store.createTask(project.id, { title: "Build a calmer workspace" });
  await store.createTask(project.id, { title: "Sketch the project dashboard", parent: parent.id });
  await store.createTask(project.id, { title: "No children here" });
  return { project, parent };
});

onDevices(["desktop", "ipad", "phone"], () => test("a row with children shows a clear round toggle in both themes", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/tree`);
  const toggle = page.locator(".task-row .tree-toggle[aria-expanded]");
  await expect(toggle).toHaveCount(1);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => window.PencilsAppearance.write({ theme: t }), theme);
    const facts = await toggle.evaluate((el) => {
      const svg = el.querySelector("svg"), probe = document.createElement("span");
      probe.style.color = "var(--ink)"; el.closest(".task-row").append(probe);
      const ink = getComputedStyle(probe).color; probe.remove();
      const s = getComputedStyle(svg), r = svg.getBoundingClientRect();
      return { color: getComputedStyle(el).color, ink, icon: parseFloat(s.width), fill: s.backgroundColor, round: s.borderRadius, size: r.width, stroke: parseFloat(s.strokeWidth) };
    });
    expect(facts.color, `${theme}: the chevron is in the text colour`).toBe(facts.ink);
    expect(facts.icon, `${theme}: a 16px chevron`).toBeGreaterThanOrEqual(16);
    expect(facts.fill, `${theme}: on a filled circle`).not.toBe("rgba(0, 0, 0, 0)");
    expect(facts.round, `${theme}: round`).toBe("50%");
    expect(facts.size, `${theme}: 24px across`).toBeGreaterThanOrEqual(24);
    expect(facts.stroke, `${theme}: bold`).toBeGreaterThanOrEqual(2);
  }
  // Collapsing turns the chevron and keeps the circle; the row without children has no toggle icon.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".task-row", { hasText: "No children here" }).locator(".tree-toggle svg")).toHaveCount(0);
}));
