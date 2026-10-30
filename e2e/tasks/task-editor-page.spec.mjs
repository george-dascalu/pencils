// The card editor scrolls on its own: on phones it is a full-screen page that locks the
// list behind it (inert, aria-modal), on iPad and desktop a docked panel. Swipes and wheel
// scrolling that start on the title, the content or a pane stay in the editor, even at its
// top and bottom; closing returns to the same list position and leaves no lock behind;
// resizing in and out of phone layout releases and restores the lock. A screen-edge guard
// stops edge swipes without blocking scrolls, pinches or control taps.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Task page scrolling" });
  const tasks = [];
  for (let i = 0; i < 35; i++) tasks.push(await store.createTask(project.id, { title: `Task ${i + 1}`, body: "## Scope\n\nPhone task page." }));
  const task = tasks[12];
  await store.updateTask(project.id, task.id, { revision: task.revision, related_records: tasks.slice(16).map((t) => t.id) });
  return { project, task };
});

const touchDevices = new Set(["phone", "ipad-portrait"]);
const opener = (page) => page.locator(`[data-action="task-open"][data-id="${app.task.id}"]:visible`).first();
const form = (page) => page.locator("#task-form");
const tapOrClick = (device, locator) => (touchDevices.has(device) ? locator.tap() : locator.click());
const background = (page) => page.evaluate(() => ({ y: scrollY, content: document.querySelector("#view-content").scrollTop }));
const inert = (page) => page.locator("#app").evaluate((el) => el.inert);
const visitList = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await opener(page).waitFor();
};
// Opens the card from partway down the list and returns the list position behind it.
async function openCard(page, device) {
  await visitList(page);
  await opener(page).scrollIntoViewIfNeeded();
  const original = await background(page);
  if (device === "phone") expect(original.content > 0 || original.y > 0, "Fixture starts partway down the task list").toBe(true);
  await tapOrClick(device, opener(page));
  await form(page).waitFor();
  return original;
}
// Drags one finger in steps; the short pauses pace the gesture like a real finger.
async function swipe(page, cdp, { x, from, to, steps }) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: from + ((to - from) * i) / steps }] });
    await page.waitForTimeout(20);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
// Proves the list behind did not move: a scroll that wrongly chains to it would take effect within this time.
async function expectStill(page, frozen, message, settle = 200) {
  await page.waitForTimeout(settle);
  expect(await background(page), message).toEqual(frozen);
}

onDevices(["phone", "ipad-portrait", "desktop"], () => {
  test("the screen-edge guard blocks edge swipes but not scrolls, pinches or control taps", async ({ page }) => {
    await visitList(page);
    const edges = await page.evaluate(() => {
      const root = document.querySelector(".main");
      const dispatch = (target, x, count = 1) => {
        const event = new Event("touchstart", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "touches", { value: Array.from({ length: count }, (_, i) => ({ clientX: x + i * 50, clientY: 200 })) });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return {
        left: dispatch(root, 2),
        right: dispatch(root, innerWidth - 2),
        middle: dispatch(root, innerWidth / 2),
        pinch: dispatch(root, 2, 2),
        button: dispatch(document.querySelector(".topbar button"), 2),
        boundary: getComputedStyle(document.documentElement).overscrollBehaviorX,
      };
    });
    expect(edges, "Edge guard preserves normal scroll starts, multi-touch and control taps").toEqual({ left: true, right: true, middle: false, pinch: false, button: false, boundary: "none" });
  });

  test("the editor opens with Close as its only exit, and closing returns to the same list position without a lock", async ({ page, device }) => {
    const original = await openCard(page, device);
    const phone = device === "phone";
    await expect(form(page).locator("[data-task-list-back]"), "Close is the only exit button").toHaveCount(0);
    expect(await inert(page)).toBe(phone);
    await expect(page.locator(".task-dialog")).toHaveAttribute("aria-modal", String(phone));
    const close = () => tapOrClick(device, page.getByRole("button", { name: "Close task", exact: true }));
    await close();
    await expect(form(page)).toHaveCount(0);
    expect(await inert(page)).toBe(false);
    expect(await background(page), "Close returns to the same list position").toEqual(original);
    // Repeated open/close leaves neither the scroll lock nor inertness behind.
    await tapOrClick(device, opener(page));
    await close();
    await expect(form(page)).toHaveCount(0);
    expect(await background(page)).toEqual(original);
  });
});

onDevices(["phone"], () => {
  test("the phone card page fills the screen and scrolls itself, never the list behind", async ({ page, device }) => {
    await openCard(page, device);
    const { width, height } = page.viewportSize();
    expect(await page.locator(".task-dialog").boundingBox()).toEqual({ x: 0, y: 0, width, height });
    const frozen = await background(page);
    const title = await form(page).locator(".task-title-row").boundingBox();
    // A gesture starting on the title must scroll this page, never the list.
    const cdp = await page.context().newCDPSession(page);
    await swipe(page, cdp, { x: width - 32, from: title.y + title.height - 5, to: 10, steps: 12 });
    await expect.poll(() => form(page).evaluate((el) => el.scrollTop), { message: "Swiping the title scrolls the task page down" }).toBeGreaterThan(10);
    const down = await form(page).evaluate((el) => el.scrollTop);
    await expectStill(page, frozen, "the list stays put while the page scrolls");
    await swipe(page, cdp, { x: width - 32, from: title.y + 5, to: title.y + title.height + 80, steps: 12 });
    await expect.poll(() => form(page).evaluate((el) => el.scrollTop), { message: "Opposite swipe scrolls the task page up" }).toBeLessThan(down);
    await cdp.detach();
    expect(await background(page)).toEqual(frozen);
    // Check both scroll boundaries; neither chains scrolling to the workspace.
    for (const direction of [-1, 1]) {
      await form(page).evaluate((el, direction) => (el.scrollTop = direction < 0 ? 0 : el.scrollHeight), direction);
      await page.mouse.move(width - 12, 90);
      await page.mouse.wheel(0, direction * 800);
      await expectStill(page, frozen, "No background scrolling at task page boundaries");
    }
    for (const pane of ["comments", "history", "details"]) {
      await form(page).locator(`[data-editor-pane="${pane}"]`).tap();
      await expect(form(page).locator(`[data-editor-pane="${pane}"]`)).toHaveAttribute("aria-pressed", "true");
      expect(await inert(page), `${pane}: the list stays inert`).toBe(true);
    }
  });

  test("leaving phone layout releases the lock and returning restores it, for new cards too", async ({ page, device }) => {
    await openCard(page, device);
    const { width, height } = page.viewportSize();
    await page.setViewportSize({ width: 820, height });
    await page.waitForFunction(() => !document.querySelector("#app").inert);
    await expect(page.locator(".task-dialog")).toHaveAttribute("aria-modal", "false");
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => document.querySelector("#app").inert);
    await page.getByRole("button", { name: "Close task", exact: true }).tap();
    await newCard(page, { tap: true });
    await form(page).waitFor();
    expect(await inert(page)).toBe(true);
    await page.getByRole("button", { name: "Close new task", exact: true }).tap();
    await expect(form(page)).toHaveCount(0);
    expect(await inert(page)).toBe(false);
  });
});

onDevices(["ipad-portrait"], () => {
  test("on iPad, swipes on the title or content scroll the panel and stop at its edges", async ({ page, device }) => {
    await openCard(page, device);
    const content = form(page).locator(".task-editor-content > .dialog-body");
    const frozen = await background(page);
    const title = await form(page).locator(".task-title-row").boundingBox();
    const x = title.x + title.width - 32;
    const y = title.y + title.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await swipe(page, cdp, { x, from: y, to: y - 40, steps: 8 });
    await expect.poll(() => content.evaluate((el) => el.scrollTop), { message: "iPad title swipe scrolls the panel" }).toBeGreaterThan(10);
    await expectStill(page, frozen, "the list stays put");
    const rect = await content.boundingBox();
    const swipeContent = (dy) => {
      const y = rect.y + rect.height / 2;
      return swipe(page, cdp, { x: rect.x + rect.width - 24, from: y, to: y + dy, steps: 10 });
    };
    await content.evaluate((el) => (el.scrollTop = 0));
    await swipeContent(-160);
    await expect.poll(() => content.evaluate((el) => el.scrollTop), { message: "iPad content retains native touch scrolling" }).toBeGreaterThan(20);
    await expectStill(page, frozen, "the list stays put");
    for (const direction of [-1, 1]) {
      await content.evaluate((el, direction) => (el.scrollTop = direction < 0 ? 0 : el.scrollHeight), direction);
      await swipeContent(-direction * 160);
      await expectStill(page, frozen, "Touch swipes at both panel boundaries stay contained", 400);
    }
    await cdp.detach();
  });
});

onDevices(["ipad-portrait", "desktop"], () => {
  test("wheel scrolling over the panel header or content stays in the panel, at its edges and in every pane", async ({ page, device }) => {
    await openCard(page, device);
    const content = form(page).locator(".task-editor-content > .dialog-body");
    const frozen = await background(page);
    const title = await form(page).locator(".task-title-row").boundingBox();
    const x = title.x + title.width - 32;
    const y = title.y + title.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(10);
    expect(await background(page), "Header wheel scroll stays in the panel").toEqual(frozen);
    for (const direction of [-1, 1]) {
      await content.evaluate((el, direction) => (el.scrollTop = direction < 0 ? 0 : el.scrollHeight), direction);
      const rect = await content.boundingBox();
      await page.mouse.move(rect.x + rect.width - 24, rect.y + 25);
      await page.mouse.wheel(0, direction * 800);
      await expectStill(page, frozen, "Panel scroll boundaries do not move the page behind");
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, direction * 800);
      await expectStill(page, frozen, "Header swipes at boundaries stay in the panel");
    }
    for (const pane of ["comments", "history", "details"]) {
      // Wide screens have no Info button; a second tap on the open pane returns to the details (0.20.14).
      const button = form(page).locator(`[data-editor-pane="${pane}"]`);
      await tapOrClick(device, (await button.isVisible()) ? button : form(page).locator('[data-editor-pane="history"]'));
      await expect(form(page).locator(`[data-editor-pane="${pane}"]`)).toHaveAttribute("aria-pressed", "true");
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 400);
      await expectStill(page, frozen, `${pane}: scrolling cannot escape a short pane`, 100);
    }
  });
});
