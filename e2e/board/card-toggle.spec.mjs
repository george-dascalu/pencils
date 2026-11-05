// Owner request (F0.21-100): a board card's description toggle sits at the bottom edge. Its hit area
// only grows on touch, and never over the card's content on a mouse; only cards with it keep the room.
// F0.22-17: it is a small pill that says what it does, Expand or Collapse, beside its chevron.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { updateProjectFrame } from "../../public/project-frame.js";

const app = useApp();
onDevices(["desktop", "phone"], () => test("the card's bottom toggle keeps a small look, a touch-only large target and clear content", async ({ page, device }) => {
  const project = await app.store.createProject({ title: `Toggle ${device}` });
  const task = await app.store.createTask(project.id, { title: "Card", body: "Some words." });
  const board = structuredClone((await app.store.snapshot(project.id)).boards[0]);
  const frame = { id: "frame", type: "frame", projectFrame: true, x: 40, y: 40, w: 640, h: 360 };
  board.nodes.push(frame); updateProjectFrame(board, frame, [task], project.title);
  await app.store.updateBoard(project.id, board.id, { revision: board.revision, nodes: board.nodes, edges: board.edges });
  await page.goto(`${app.base}/#project/${project.id}/board/${board.id}`);
  const card = page.locator("[data-node]").filter({ has: page.locator("[data-pro=task-collapse]") }).first(), toggle = card.locator("[data-pro=task-collapse]");
  await toggle.waitFor();
  await expect(card.locator(".board-node-content")).toHaveCSS("padding-bottom", "28px");
  await expect(toggle).toHaveText("Collapse");
  await expect(toggle).toHaveAccessibleName("Collapse card description");
  const look = await toggle.evaluate((el) => {
    const s = getComputedStyle(el), box = el.getBoundingClientRect(), outer = el.offsetParent.getBoundingClientRect(), zoom = box.height / el.offsetHeight;
    return { height: el.offsetHeight, radius: parseFloat(s.borderTopLeftRadius), border: s.borderTopWidth, fill: s.backgroundColor, fits: el.scrollWidth <= el.clientWidth + 0.5, gap: (outer.bottom - box.bottom) / zoom, centre: Math.abs(box.left + box.width / 2 - (outer.left + outer.width / 2)) };
  });
  expect(look.height, "visible size, in board units").toBe(20);
  expect(look.radius, "a pill").toBeGreaterThanOrEqual(10);
  expect(look.border, "a fine outline").toBe("1px");
  expect(look.fill, "a fill of its own").not.toBe("rgba(0, 0, 0, 0)");
  expect(look.fits, "the word fits inside it").toBe(true);
  expect(look.gap, "4px above the bottom of the card's content").toBeCloseTo(4, 0);
  expect(look.centre, "centred").toBeLessThan(2);
  const hit = await toggle.evaluate((el) => parseFloat(getComputedStyle(el, "::before").height) || 0);
  if (device === "desktop") {
    expect(hit, "no hidden hit area over the content").toBe(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveText("Expand");
    await expect(toggle).toHaveAccessibleName("Expand card description");
    const t = await toggle.boundingBox();
    await page.mouse.click(t.x + t.width / 2, t.y - 3);
    await expect(toggle, "a click just above it does not toggle").toHaveAttribute("aria-expanded", "false");
  } else {
    expect(hit, "touch target").toBeGreaterThanOrEqual(44);
    expect(await toggle.evaluate((el) => parseFloat(getComputedStyle(el, "::before").bottom)), "the target stays inside the card").toBeGreaterThanOrEqual(-4);
  }
}));
