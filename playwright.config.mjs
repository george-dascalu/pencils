// Browser tests (see e2e/fixtures.mjs).
//   npm run e2e [-- <file or title filter>]   every test in Chromium, except audits and @heavy scale tests
//   npm run e2e:affected                      the areas the uncommitted changes need (scripts/affected.mjs)
//   npm run test:release                      the same plus the @gate tests in Firefox and WebKit (RELEASE=1;
//                                             GATE_BROWSERS=firefox picks the engines installed), then the @heavy
//                                             scale tests on their own, then the Docker check
//   npx playwright test --project=audit       audits, which report findings rather than guard a change
//   npx playwright test --project=docker      the offline Docker image check, which changes host networking and
//                                             would abort other tests' requests, so it never runs alongside them
import os from "node:os";
import { defineConfig } from "@playwright/test";

// Each worker runs the app's server in its own Node process, whose heap otherwise grows lazily to
// about 600 MB; a 320 MB ceiling collects sooner and keeps workers near 400 MB (F0.23-8). The @heavy
// scale tests (HEAVY=1) hold 100,000-object boards and need more.
if (process.env.HEAVY !== "1" && !/--max-old-space-size/.test(process.env.NODE_OPTIONS || "")) process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} --max-old-space-size=320`.trim();
const gate = (process.env.GATE_BROWSERS || "firefox,webkit").split(",").filter(Boolean);
const chromium = { browserName: "chromium", launchOptions: { args: ["--no-sandbox"] } };
// WebKit's network process crashes on the GIO modules a snap-packaged terminal (VS Code) points it
// at. scripts/webkit-local.sh adds the libraries a host without sudo lacks.
const { GIO_MODULE_DIR, ...webkitEnv } = process.env;
if (!GIO_MODULE_DIR?.includes("/snap/")) webkitEnv.GIO_MODULE_DIR = GIO_MODULE_DIR;
// The tests need no desktop services, and WebKit waits 25 seconds per page for a failed desktop
// portal on the session bus.
webkitEnv.DBUS_SESSION_BUS_ADDRESS = "unix:path=/nonexistent";
const webkit = { browserName: "webkit", launchOptions: { env: webkitEnv } };

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.mjs",
  outputDir: "test-results",
  timeout: 45000,
  expect: { timeout: 8000 },
  retries: 1,
  // A test that passes only on its retry fails the batch check (RELEASE=1), so flaky tests get fixed.
  failOnFlakyTests: process.env.RELEASE === "1",
  // Up to 5 workers, a quarter of the host's threads (owner request, F0.23-8): with the heap ceiling
  // above, half the CPU and memory of the 12 used since F0.22-5, in about 1.6 times as long; 6 were
  // no faster than 5, and 16 had run Chromium only 10% faster than 12.
  workers: Number(process.env.E2E_WORKERS) || Math.max(1, Math.min(5, Math.floor(os.availableParallelism() / 4))),
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  // A trace of every test cost a fifth of each run and hid timing races (F0.22-5): only a retry
  // records one, so a failure still comes with its trace.
  use: { trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    // The @heavy scale tests (100,000-object boards, 100 members) run with HEAVY=1, which
    // scripts/affected.mjs sets when board data or storage changes; the batch check runs them on their
    // own afterwards, two at a time (package.json test:release): several at once beside the other
    // tests stalled the host long enough to time out page loads elsewhere (F0.23-6).
    { name: "chromium", use: chromium, grepInvert: process.env.HEAVY === "1" ? /@audit/ : /@audit|@heavy/, testIgnore: "**/offline.spec.mjs" },
    ...(process.env.RELEASE ? [] : [
      { name: "docker", use: chromium, testMatch: "**/offline.spec.mjs" },
      { name: "audit", use: chromium, grep: /@audit/ },
    ]),
    // Phone and iPad tests run in WebKit too, the engine of iPhones and iPads; the release runs the
    // affected ones (IOS=0 skips them on a host without WebKit).
    // Every phone and iPad test (onDevices tags them @touch), besides scale tests and audits.
    { name: "ios", use: { ...webkit, touchEngine: "webkit" }, grep: /@touch/, grepInvert: /@heavy|@audit/ },
    // The gate takes desktop presets only: touch presets would run in Chromium again (fixtures.mjs),
    // and phone and iPad tests already run in WebKit through the ios project.
    ...gate.map((browserName) => ({ name: browserName, use: browserName === "webkit" ? webkit : { browserName }, grep: /@gate/, grepInvert: /@touch/ })),
  ],
});
