// Applied before styles load to avoid a light flash when dark mode is selected.
(() => {
  const fonts = [
    ["manrope", "Manrope", "Clean & expressive"],
    ["dmsans", "DM Sans", "Warm & balanced"],
    ["spacegrotesk", "Space Grotesk", "Distinctive & geometric"],
    ["outfit", "Outfit", "Friendly & rounded"],
    ["sora", "Sora", "Crisp & technical"],
    ["worksans", "Work Sans", "Practical & human"],
    ["lora", "Lora", "Literary serif"],
    ["fraunces", "Fraunces", "Characterful serif"],
  ];
  // Style settings (Settings → You → Style, public/style-settings.js): each choice becomes a CSS
  // custom property on the root element, and the shared styles fall back to their defaults without
  // it. "list-<name>" keys colour the list callouts.
  const styles = {
    accent: { color: true },
    headingColor: { color: true },
    calloutColor: { color: true },
    textSize: { min: 12, max: 22, step: 1, unit: "px", initial: 15 },
    lineWidth: { min: 50, max: 120, step: 2, unit: "ch", initial: 78 },
    lineHeight: { min: 1.3, max: 2.2, step: 0.05, unit: "", initial: 1.75 },
    roundness: { min: 0, max: 2, step: 0.25, unit: "", initial: 1 },
    documentFont: { font: true },
    codeFont: { options: { system: "monospace", modern: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace", courier: "'Courier New', Courier, monospace" } },
  };
  const rule = (name) => styles[name] || (/^list-[a-z]{1,20}$/.test(name) ? { color: true } : null);
  function styleChoices(raw) {
    const out = {};
    for (const [name, value] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      const r = rule(name);
      if (r && (r.color ? /^#[0-9a-f]{6}$/i.test(value) : r.font ? value === "workspace" || fonts.some((f) => f[0] === value) : r.options ? Object.hasOwn(r.options, value) : Number.isFinite(value) && value >= r.min && value <= r.max))
        out[name] = value;
    }
    return out;
  }
  const property = (name) => `--style-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  // Themes adapted from Obsidian (themes.css); "default" is the original look.
  const looks = [
    ["default", "Pencils", "Calm greens"],
    ["minimal", "Minimal", "Neutral greys and slate"],
    ["paper", "Paper", "Warm cream and gold"],
    ["catppuccin", "Catppuccin", "Latte and Mocha pastels"],
    ["typewriter", "Typewriter", "iA Writer type on warm paper"],
  ];
  const key = "pencils:appearance",
    media = matchMedia("(prefers-color-scheme: dark)");
  function read() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(key)) || {};
    } catch {
      /* Defaults also work with restricted browser storage. */
    }
    return {
      font: fonts.some((f) => f[0] === raw.font) ? raw.font : "manrope",
      theme: ["light", "dark", "system"].includes(raw.theme)
        ? raw.theme
        : "system",
      collapsed: raw.collapsed === true,
      density: raw.density === "compact" ? "compact" : "comfortable",
      navigation: raw.navigation === "trackpad" ? "trackpad" : "mouse",
      singleKeys: raw.singleKeys !== false,
      look: looks.some((l) => l[0] === raw.look) ? raw.look : "default",
      rainbow: raw.rainbow === true,
      style: styleChoices(raw.style),
    };
  }
  function apply() {
    const value = read(),
      root = document.documentElement;
    root.dataset.theme =
      value.theme === "system"
        ? media.matches
          ? "dark"
          : "light"
        : value.theme;
    root.dataset.font = value.font;
    root.dataset.look = value.look;
    root.toggleAttribute("data-rainbow", value.rainbow);
    root.dataset.density = value.density;
    root.dataset.sidebar = value.collapsed ? "collapsed" : "expanded";
    root.style.colorScheme = root.dataset.theme;
    for (const name of [...root.style].filter((p) => p.startsWith("--style-"))) root.style.removeProperty(name);
    for (const [name, choice] of Object.entries(value.style)) {
      const r = rule(name);
      root.style.setProperty(property(name), r.font ? (choice === "workspace" ? "var(--app-font)" : `"${fonts.find((f) => f[0] === choice)[1]}", sans-serif`) : r.options ? r.options[choice] : r.unit !== undefined ? `${choice}${r.unit}` : choice);
    }
    window.dispatchEvent(new Event("pencils-appearance"));
  }
  function write(changes) {
    localStorage.setItem(key, JSON.stringify({ ...read(), ...changes }));
    apply();
  }
  window.PencilsAppearance = { fonts, looks, styles, read, write, apply };
  media.addEventListener("change", apply);
  window.addEventListener("storage", (e) => {
    if (e.key === key || e.key === null) apply();
  });
  apply();
})();
