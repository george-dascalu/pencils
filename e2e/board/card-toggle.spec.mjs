// Owner request (F0.21-100): a board card's description toggle sits at the bottom edge. Its hit area
// only grows on touch, and never over the card's content on a mouse.
// F0.22-18 (like Miro): a round button with only its arrow, across the card's bottom edge, half
// outside it, so the card keeps no room for it; a selected card's bottom connection point and the
// selection toolbar move clear of it.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { updateProjectFrame } from "../../public/project-frame.js";

const app = useApp();
async function open(page, device) {
  const project = await app.store.createProject({ title: `Toggle ${device}` });
  const task = await app.store.createTask(project.id, { title: "Card", body: "Some words." });
  const board = structuredClone((await app.store.snapshot(project.id)).boards[0]);
  const frame = { id: "frame", type: "frame", projectFrame: true, x: 40, y: 40, w: 640, h: 360 };
  board.nodes.push(frame); updateProjectFrame(board, frame, [task], project.title);
  await app.store.updateBoard(project.id, board.id, { revision: board.revision, nodes: board.nodes, edges: board.edges });
  await page.goto(`${app.base}/#project/${project.id}/board/${board.id}`);
  const card = page.locator("[data-node]").filter({ has: page.locator("[data-pro=task-collapse]") }).first(), toggle = card.locator("[data-pro=task-collapse]");
  await toggle.waitFor();
  return { card, toggle };
}
// Where the toggle is against its card, in board units, and whether what shows at its lower half is it.
const placement = (toggle) => toggle.evaluate((el) => {
  const card = el.closest("[data-node]"), box = el.getBoundingClientRect(), outer = card.getBoundingClientRect(), zoom = box.height / el.offsetHeight;
  const below = document.elementFromPoint(box.left + box.width / 2, box.bottom - box.height / 4);
  const s = getComputedStyle(el);
  return {
    width: el.offsetWidth, height: el.offsetHeight, radius: parseFloat(s.borderTopLeftRadius), fill: s.backgroundColor,
    across: (box.top + box.height / 2 - outer.bottom) / zoom, centre: Math.abs(box.left + box.width / 2 - (outer.left + outer.width / 2)),
    shown: !!below && el.contains(below), padding: getComputedStyle(card.querySelector(".board-node-content")).paddingBottom,
  };
});

onDevices(["desktop", "phone"], () => test("the card's toggle is a round arrow across the bottom edge, with a touch-only large target and no room kept for it", async ({ page, device }) => {
  const { card, toggle } = await open(page, device);
  await expect(toggle).toHaveText("");
  await expect(toggle).toHaveAccessibleName("Collapse card description");
  await expect(toggle).toHaveAttribute("title", "Collapse description");
  const at = await placement(toggle);
  expect(at.width, "round, in board units").toBe(24);
  expect(at.height).toBe(24);
  expect(at.radius).toBeGreaterThanOrEqual(12);
  expect(at.fill, "a fill of its own").not.toBe("rgba(0, 0, 0, 0)");
  expect(Math.abs(at.across), "its middle on the bottom edge").toBeLessThan(1.5);
  expect(at.centre, "centred").toBeLessThan(2);
  expect(at.shown, "its lower half shows outside the card, not clipped").toBe(true);
  expect(at.padding, "no room kept for it").toBe("0px");
  const hit = await toggle.evaluate((el) => parseFloat(getComputedStyle(el, "::before").height) || 0);
  if (device === "desktop") {
    expect(hit, "no hidden hit area over the content").toBe(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAccessibleName("Expand card description");
    const t = await toggle.boundingBox();
    await page.mouse.click(t.x + t.width / 2, t.y - 3);
    await expect(toggle, "a click just above it does not toggle").toHaveAttribute("aria-expanded", "false");
  } else expect(hit, "touch target").toBeGreaterThanOrEqual(44);
  // Selected, the card's bottom connection point moves below the toggle (and its touch target), and the toggle still works.
  await card.locator(".live-card-heading .task-title").click();
  const port = card.locator(".connection-port.port-bottom");
  await expect(port).toBeVisible();
  const clear = await toggle.evaluate((el, hit) => {
    const box = el.getBoundingClientRect(), zoom = box.height / el.offsetHeight, p = el.parentElement.querySelector(".port-bottom").getBoundingClientRect();
    return (p.top - (box.top + box.height / 2 + Math.max(box.height, hit * zoom) / 2)) / zoom;
  }, hit);
  expect(clear, "the connection point is clear below the toggle").toBeGreaterThanOrEqual(2);
  const expanded = await toggle.getAttribute("aria-expanded");
  await toggle.click();
  await expect(toggle, "the toggle still works on a selected card").toHaveAttribute("aria-expanded", expanded === "true" ? "false" : "true");
}));

test("a selection toolbar below a card clears its moved connection point", async ({ page }) => {
  // The plan's card opens near the top of the view, with no room above it, so its toolbar goes below.
  const { card } = await open(page, "desktop");
  await card.locator(".live-card-heading .task-title").click();
  const port = card.locator(".connection-port.port-bottom"), tools = page.locator("#selection-tools");
  await expect(tools).toBeVisible();
  const box = await card.boundingBox();
  expect((await tools.boundingBox()).y, "the toolbar is below the card").toBeGreaterThan(box.y + box.height);
  await expect.poll(async () => (await tools.boundingBox()).y - ((await port.boundingBox()).y + (await port.boundingBox()).height), "the toolbar sits below the connection point").toBeGreaterThanOrEqual(4);
});
