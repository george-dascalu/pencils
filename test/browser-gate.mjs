import { spawn } from "node:child_process";
const browsers = (process.env.GATE_BROWSERS || "chromium,firefox,webkit").split(
  ",",
);
const suites = [
  "review-visibility",
  "project-layout",
  "project-settings",
  "navigation",
  "table-viewport",
  "kanban-viewport",
  "kanban-swimlanes",
  "tree-viewport",
  "timeline-viewport",
  "timeline-weekends",
  "timeline-date-editor",
  "timeline-selection",
  "help",
  "local-sign-in",
  "task-editor",
  "table-tools",
  "task-reorder",
  "project-frame",
  "project-frame-lan",
  "teams-capacity",
  "project-sources",
  "drawing-view",
  "accessibility",
  "draft-tasks",
  "board-search",
  "review-workflows",
];
const failures = [];
for (const browser of browsers) {
  if (!["chromium", "firefox", "webkit"].includes(browser))
    throw Error(`Unknown browser ${browser}`);
  for (const suite of suites) {
    console.log(`\n${browser}: ${suite}`);
    const status = await new Promise((resolve) => {
      const child = spawn(process.execPath, [`test/${suite}.mjs`], {
        stdio: "inherit",
        env: { ...process.env, BROWSER: browser },
      });
      child.once("error", (error) => {
        console.error(error.message);
        resolve(1);
      });
      child.once("exit", (code) => resolve(code ?? 1));
    });
    if (status) failures.push(`${browser}/${suite}`);
  }
}
if (failures.length) {
  console.error(`Failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${suites.length * browsers.length} browser suites. Physical iPad/Pencil testing is separate.`,
  );
