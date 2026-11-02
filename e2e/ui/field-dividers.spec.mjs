// Owner request, 2 November 2026: field dividers are straight vertical strokes;
// only the surrounding group keeps rounded corners, including zoomed board cards.
import { test, expect, onDevices } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";

const app = useCustomApp({ server: () => ({ productionAssets: true }), seed: async (store) => {
  const project = await store.createProject({ title: "Straight dividers", key: "LINE" });
  const parent = await store.createTask(project.id, { title: "Parent card", assignee: "George", priority: "high", status: "in-progress", start: "2026-11-01", due: "2026-11-05" });
  await store.createTask(project.id, { title: "Related card", assignee: "Alex", priority: "low", status: "todo", parent: parent.id, due: "2026-11-06" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card", type: "task", task: parent.id, x: 140, y: 120, w: 520, h: 240 }] });
  return { project, parent, board };
} });

async function straight(boxes, phone) {
  const paint = await boxes.evaluateAll((boxes) => boxes.filter((box) => box.getClientRects().length).map((box) => ({
    group: box.className,
    radius: getComputedStyle(box).borderTopLeftRadius,
    fields: [...box.children].filter((el, index) => index && el.getClientRects().length && !el.matches(".sr-only, [data-field-first-visible]")).map((el) => {
      const cs = getComputedStyle(el), before = getComputedStyle(el, "::before");
      return { field: el.className, shadow: cs.boxShadow, image: cs.backgroundImage, size: cs.backgroundSize, line: { content: before.content, width: before.width, radius: before.borderTopLeftRadius } };
    }),
  })));
  expect(paint.length).toBeGreaterThan(0);
  for (const box of paint) {
    expect(parseFloat(box.radius), `${box.group}: outer corners stay rounded`).toBeGreaterThan(0);
    for (const field of box.fields) {
      expect(field.shadow, `${box.group}/${field.field}: no curved inset shadow`).toBe("none");
      if (phone) continue; // Narrow phone layouts deliberately omit field dividers.
      if (box.group.includes("row-fields")) {
        expect(field.line.content).toBe('""');
        expect(field.line.width).toBe("1px");
        expect(field.line.radius).toBe("0px");
      } else {
        expect(field.image, `${box.group}/${field.field}: straight divider`).toContain("linear-gradient");
        expect(field.size.split(",")[0].trim()).toMatch(/^1px /);
      }
    }
  }
}

onDevices(["desktop", "ipad", "phone"], () => test("grouped fields use straight dividers and preserve the status arrow @gate", async ({ page, device }) => {
  for (const view of [`board/${app.board.id}`, "list", "tree", "kanban"]) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await expect(page.locator(".field-box:visible").first()).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => window.PencilsAppearance.write({ look: "paper", theme }), theme);
      await straight(page.locator(".field-box:visible"), device === "phone");
    }
    if (view.startsWith("board")) {
      const status = page.locator(".canvas-task-status").first();
      const style = await status.evaluate((el) => ({ image: getComputedStyle(el).backgroundImage, sizes: getComputedStyle(el).backgroundSize.split(",").map((size) => size.trim()) }));
      expect(style.image).toContain("data:image/svg+xml");
      if (device !== "phone") {
        expect(style.sizes).toHaveLength(2);
        expect(style.sizes[0]).toMatch(/^1px /);
        expect(parseFloat(style.sizes[1])).toBeGreaterThan(1);
      }
      await status.click();
      await page.locator("#shared-select-menu").getByRole("option", { name: "Done", exact: true }).click();
      await expect(status).toHaveValue("done");
    }
  }
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-task-order-row="${app.parent.id}"] [data-action="task-open"]:visible`).first().click();
  await expect(page.locator("#task-form")).toBeVisible();
  await straight(page.locator("#task-form .field-box:visible"), device === "phone");
}));
