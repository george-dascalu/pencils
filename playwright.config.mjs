// Browser tests (see e2e/fixtures.mjs).
//   npm run e2e [-- <file or title filter>]   every test in Chromium, except audits
//   npm run test:release                      the same plus the @gate tests in Firefox and WebKit (RELEASE=1;
//                                             GATE_BROWSERS=firefox picks the engines installed), then the Docker check
//   npx playwright test --project=audit       audits, which report findings rather than guard a change
//   npx playwright test --project=docker      the offline Docker image check, which changes host networking and
//                                             would abort other tests' requests, so it never runs alongside them
import { defineConfig } from "@playwright/test";

const gate = (process.env.GATE_BROWSERS || "firefox,webkit").split(",").filter(Boolean);
const chromium = { browserName: "chromium", launchOptions: { args: ["--no-sandbox"] } };

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.mjs",
  outputDir: "test-results",
  timeout: 45000,
  expect: { timeout: 8000 },
  retries: 1,
  workers: Number(process.env.E2E_WORKERS) || 8,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: chromium, grepInvert: /@audit/, testIgnore: "**/offline.spec.mjs" },
    ...(process.env.RELEASE ? [] : [
      { name: "docker", use: chromium, testMatch: "**/offline.spec.mjs" },
      { name: "audit", use: chromium, grep: /@audit/ },
    ]),
    ...gate.map((browserName) => ({ name: browserName, use: { browserName }, grep: /@gate/ })),
  ],
});
