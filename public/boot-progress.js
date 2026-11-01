// The splash screen's ring (owner request T97, 1 November 2026): index.html draws it at a tenth,
// and the app moves it on as it signs in, loads the workspace and opens the page; the first render
// replaces it.
export function bootProgress(value, step) {
  const boot = document.querySelector("#app > .boot");
  if (!boot) return;
  boot.style.setProperty("--boot-progress", String(value));
  boot.setAttribute("aria-valuenow", String(Math.round(value * 100)));
  boot.setAttribute("aria-valuetext", step);
  boot.querySelector(".boot-step").textContent = step;
}
