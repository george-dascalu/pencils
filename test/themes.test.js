import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Owner request, 29 October 2026: themes adapted from Obsidian (public/themes.css). Each sets the
// shared colour tokens for light and dark, and keeps text, muted text, links and accents at 4.5:1.
const css = fs.readFileSync(new URL("../public/themes.css", import.meta.url), "utf8");
const block = (selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} is defined`);
  const body = css.slice(at, css.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.match(/#[0-9a-f]{6}\b/i)?.[0] ?? value.trim()]));
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const look of ["minimal", "paper", "catppuccin", "typewriter"])
  for (const mode of ["light", "dark"])
    test(`${look} ${mode} sets every colour token and keeps text readable`, () => {
      const tokens = block(mode === "light" ? `:root[data-look="${look}"]` : `:root[data-look="${look}"][data-theme="dark"]`);
      for (const name of ["--ink", "--muted", "--line", "--green", "--accent", "--paper", "--side", "--surface", "--surface-soft", "--control-border", "--button-primary"])
        assert.match(tokens[name] || "", /^#[0-9a-f]{6}$/i, `${name} is a colour`);
      for (const [text, background] of [["--ink", "--paper"], ["--ink", "--surface"], ["--muted", "--paper"], ["--muted", "--surface"], ["--green", "--paper"], ["--green", "--surface"], ["--green", "--surface-soft"]]) {
        const ratio = contrast(tokens[text], tokens[background]);
        assert.ok(ratio >= 4.5, `${text} on ${background}: ${ratio.toFixed(2)}:1`);
      }
      if (tokens["--markdown-mark"])
        for (const background of ["--paper", "--surface", "--surface-soft"])
          assert.ok(contrast(tokens["--markdown-mark"], tokens[background]) >= 4.5, `--markdown-mark on ${background}`);
      const label = contrast(mode === "light" ? "#ffffff" : "#f2f8ed", tokens["--button-primary"]);
      assert.ok(label >= 4.5, `primary button text: ${label.toFixed(2)}:1`);
    });

for (const look of ["minimal", "paper", "catppuccin", "typewriter"])
  test(`${look}'s dark block sets everything its light block does, so nothing leaks from light into dark`, () => {
    const light = Object.keys(block(`:root[data-look="${look}"]`)), dark = Object.keys(block(`:root[data-look="${look}"][data-theme="dark"]`));
    assert.deepEqual(light.filter((name) => !dark.includes(name)), []);
  });
