// Board detail motion: when zooming swaps cards between their bitmap preview and full detail,
// the fade reverses continuously from the displayed opacity, a nearly finished fade does not
// restart a full duration, finished fades clean up, a live reduced-motion preference stops them,
// and the preview paints the same silhouettes as the cards (white task, yellow note, diamond).
import fs from "node:fs/promises";
import { test, expect } from "../fixtures.mjs";

// The modules run on a bare page, without the app around them.
const origin = "http://motion.test";
const modules = new Set(["board-detail-transition.js", "board-preview.js", "node-layout.js"]);
test.beforeEach(async ({ page }) => {
  await page.route(`${origin}/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (modules.has(name)) await route.fulfill({ contentType: "text/javascript", body: await fs.readFile(new URL(`../../public/${name}`, import.meta.url)) });
    else await route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" });
  });
  // The fades only run without the reduced-motion preference.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(origin);
});

test("detail fades reverse from the displayed opacity, finish promptly, clean up and stop for reduced motion", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { boardDetailTransition } = await import("/board-detail-transition.js");
    const el = document.body.appendChild(document.createElement("div"));
    el.dataset.node = "probe";
    el.style.cssText = "width:100px;height:80px;background:white";
    let parks = 0, changes = 0;
    const motion = boardDetailTransition({ park: () => parks++, changed: () => changes++ });
    motion.show(el, true, true);
    const animation = el.getAnimations()[0];
    await animation.ready;
    animation.pause();
    animation.currentTime = 110;
    const before = Number(getComputedStyle(el).opacity);
    motion.show(el, false);
    const reversed = el.getAnimations()[0];
    const after = Number(getComputedStyle(el).opacity);
    motion.show(el, true);
    const same = el.getAnimations()[0] === animation && reversed === animation;
    await animation.ready;
    animation.currentTime = 218;
    const start = performance.now();
    await animation.finished;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const remaining = performance.now() - start;
    const settled = el.getAnimations().length === 0 && !el.dataset.detailTransition && parks === 0;
    motion.show(el, false);
    await el.getAnimations()[0].finished;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const exited = parks === 1 && motion.bitmap().size === 0;
    motion.show(el, true, true);
    const pending = el.getAnimations()[0];
    await pending.ready;
    pending.pause();
    pending.currentTime = 100;
    motion.show(el, false);
    pending.pause();
    pending.currentTime = 100;
    window.motionProbe = { el, motion, counts: () => ({ parks, changes }) };
    return { before, after, same, remaining, settled, exited };
  });
  expect(result.before > 0 && result.before < 1, `mid-fade opacity ${result.before}`).toBe(true);
  expect(Math.abs(result.before - result.after), "reversal preserves the displayed opacity").toBeLessThan(0.01);
  expect(result.same, "reversal reuses the running animation").toBe(true);
  expect(result.remaining, "a nearly complete fade does not restart a full duration").toBeLessThan(160);
  expect(result.settled, "a finished fade cleans up without parking the card").toBe(true);
  expect(result.exited, "a finished fade-out parks the card and clears its bitmap").toBe(true);
  // Switching to reduced motion mid-fade finishes it at once.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => window.motionProbe.counts().parks === 2);
  expect(await page.evaluate(() => window.motionProbe.el.getAnimations().length)).toBe(0);
});

test("board previews paint the same silhouettes as the cards", async ({ page }) => {
  const pixels = await page.evaluate(async () => {
    const { paintNodePreview } = await import("/board-preview.js");
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 200;
    const g = c.getContext("2d"), camera = { x: 0, y: 0, z: 1 };
    const theme = { surface: "#ffffff", border: "#dce3d1", selection: "#789a53" };
    const sample = (x, y) => [...g.getImageData(x, y, 1, 1).data];
    paintNodePreview(g, { type: "task", x: 10, y: 10, w: 100, h: 60 }, camera, false, theme);
    const white = sample(50, 40), corner = sample(10, 10);
    paintNodePreview(g, { type: "sticky", x: 130, y: 10, w: 100, h: 60 }, camera, false, theme);
    const yellow = sample(150, 40);
    paintNodePreview(g, { type: "shape", shape: "diamond", color: "#ff0000", x: 10, y: 100, w: 80, h: 80 }, camera, false, theme);
    const diamond = sample(50, 140), outside = sample(15, 105);
    return { white, corner, yellow, diamond, outside };
  });
  expect(pixels.white, "a white task card").toEqual([255, 255, 255, 255]);
  expect(pixels.corner[3], "with rounded corners").toBe(0);
  expect(pixels.yellow, "a yellow note").toEqual([245, 231, 162, 255]);
  expect(pixels.diamond, "a filled diamond").toEqual([255, 0, 0, 255]);
  expect(pixels.outside[3], "nothing outside the diamond").toBe(0);
});
