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
    root.dataset.sidebar = value.collapsed ? "collapsed" : "expanded";
    root.style.colorScheme = root.dataset.theme;
    window.dispatchEvent(new Event("pencils-appearance"));
  }
  function write(changes) {
    localStorage.setItem(key, JSON.stringify({ ...read(), ...changes }));
    apply();
  }
  window.PencilsAppearance = { fonts, read, write, apply };
  media.addEventListener("change", apply);
  window.addEventListener("storage", (e) => {
    if (e.key === key || e.key === null) apply();
  });
  apply();
})();
