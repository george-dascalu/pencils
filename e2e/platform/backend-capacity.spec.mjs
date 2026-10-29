// Backend capacity: 100 signed-in members, each holding a live-update (SSE) connection, work across
// 3 projects of 301 tasks and 101 documents at once: they open tasks and save edits, load project
// snapshots, run queries and search, 10 rounds each, as a synchronised burst (or, with PACED=1,
// staggered arrivals with one-second think time). Every request must succeed. Timings, event loop
// delay and memory go to artifacts/backend-capacity.json (backend-capacity-paced.json when paced).
// No browser; a temporary vault.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { Auth } from "../../server/auth.js";

const paced = process.env.PACED === "1";

const app = useCustomApp({
  seed: async (store, app) => {
    const projects = [];
    for (let p = 0; p < 3; p++) {
      const project = await store.createProject({ title: `Capacity project ${p}` });
      const task = await store.createTask(project.id, { title: "Seed task", body: "Markdown notes for an ordinary task." });
      const raw = await fs.readFile(path.join(app.root, task.file), "utf8");
      const doc = await store.createDocument(project.id, { title: "Seed document", body: "# Project notes\n\n" + "A paragraph of document content.\n\n".repeat(20) });
      const document = await fs.readFile(path.join(app.root, doc.file), "utf8");
      for (let i = 0; i < 300; i += 20)
        await Promise.all(
          Array.from({ length: 20 }, (_, offset) => {
            const index = i + offset, id = `t-load-${index}`;
            return fs.writeFile(store.file(project.id, "tasks", id), raw.replaceAll(task.id, id).replace("title: Seed task", `title: Task ${index}`).replace(task.key, `CAP-${index + 2}`));
          }),
        );
      for (let i = 0; i < 100; i += 20)
        await Promise.all(
          Array.from({ length: 20 }, (_, offset) => {
            const index = i + offset, id = `d-load-${index}`;
            return fs.writeFile(store.file(project.id, "documents", id), document.replaceAll(doc.id, id).replace("title: Seed document", `title: Document ${index}`));
          }),
        );
      projects.push(project.id);
    }
    store.changed();
    const auth = new Auth(store, true);
    const users = Array.from({ length: 100 }, (_, i) => ({ username: `member-${i}`, admin: false, organisations: { "o-default": "editor" } }));
    await fs.mkdir(path.dirname(auth.file), { recursive: true });
    await fs.writeFile(auth.file, JSON.stringify(users), { mode: 0o600 });
    const cookies = users.map((user) => {
      const token = randomBytes(32).toString("hex");
      auth.sessions.set(token, { username: user.username, expires: Date.now() + 3600000 });
      return `pencils_session=${token}`;
    });
    return { projects, users, cookies, auth };
  },
  server: (store, app) => ({ auth: app.auth }),
});

test("100 signed-in members with live updates open, save, query and search at once without a failed request", { tag: "@heavy" }, async () => {
  test.setTimeout(paced ? 300000 : 180000);
  const { projects, users, cookies } = app;
  const controllers = [], timings = {}, errors = [];
  const delay = monitorEventLoopDelay({ resolution: 10 });
  async function request(user, route, method = "GET", body) {
    const started = performance.now();
    const response = await fetch(app.base + route, {
      method,
      headers: { Cookie: cookies[user], "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    const kind = method === "PATCH" ? "save" : route.endsWith("/query") ? "query" : route.includes("search") ? "search" : route.includes("/tasks/") ? "task" : "snapshot";
    (timings[kind] ||= []).push(performance.now() - started);
    if (!response.ok) errors.push({ status: response.status, error: data.error });
    return data;
  }
  try {
    // Warm file caches/indexes, then retain 100 authenticated SSE subscribers.
    for (const project of projects) {
      await request(0, `/api/projects/${project}`);
      await request(0, `/api/projects/${project}/query`, "POST", { limit: 100 });
    }
    await Promise.all(
      users.map(async (_, i) => {
        const controller = new AbortController();
        controllers.push(controller);
        const response = await fetch(`${app.base}/api/events?project=${projects[i % 3]}`, { headers: { Cookie: cookies[i] }, signal: controller.signal });
        expect(response.ok, "SSE subscription").toBe(true);
        await response.body.getReader().read();
      }),
    );
    for (const key of Object.keys(timings)) delete timings[key];
    delay.enable();
    const start = performance.now();
    await Promise.all(
      users.map(async (_, i) => {
        // Staggered arrivals in paced mode: part of the workload, not a wait for state.
        if (paced) await new Promise((resolve) => setTimeout(resolve, i * 100));
        const project = projects[i % 3], route = `/api/projects/${project}`;
        for (let round = 0; round < 10; round++) {
          if (round % 5 === 0) {
            const task = await request(i, `${route}/tasks/t-load-${i}`);
            await request(i, `${route}/tasks/t-load-${i}`, "PATCH", { revision: task.revision, body: `Member ${i}, edit ${round}.` });
          } else if (round % 3 === 0) await request(i, route);
          else if (round % 3 === 1) await request(i, `${route}/query`, "POST", { limit: 100 });
          else await request(i, "/api/search?q=Task");
          // Think time between a member's requests: part of the workload, not a wait for state.
          await new Promise((resolve) => setTimeout(resolve, paced ? 1000 : 25));
        }
      }),
    );
    const elapsed = performance.now() - start;
    const summary = Object.fromEntries(
      Object.entries(timings).map(([name, samples]) => {
        samples.sort((a, b) => a - b);
        return [
          name,
          {
            requests: samples.length,
            medianMs: Math.round(samples[Math.floor(samples.length * 0.5)]),
            p95Ms: Math.round(samples[Math.floor(samples.length * 0.95)]),
            maxMs: Math.round(samples.at(-1)),
          },
        ];
      }),
    );
    const result = {
      date: "2026-10-20",
      workload: paced ? "staggered arrival, one-second think time" : "synchronised burst",
      simulatedUsers: 100,
      sseConnections: 100,
      projects: 3,
      tasksPerProject: 301,
      documentsPerProject: 101,
      rounds: 10,
      cpu: os.cpus()[0].model,
      cores: os.cpus().length,
      temporaryVault: "local /tmp",
      elapsedMs: Math.round(elapsed),
      requestsPerSecond: Math.round((Object.values(timings).reduce((sum, values) => sum + values.length, 0) * 1000) / elapsed),
      eventLoopP95Ms: Math.round(delay.percentile(95) / 1e6),
      eventLoopMaxMs: Math.round(delay.max / 1e6),
      rssMiB: Math.round(process.memoryUsage().rss / 1048576),
      summary,
      errors,
    };
    console.log(JSON.stringify(result, null, 2));
    await fs.mkdir("artifacts", { recursive: true });
    await fs.writeFile(`artifacts/backend-capacity${paced ? "-paced" : ""}.json`, JSON.stringify(result, null, 2));
    expect(errors, "every request succeeds").toEqual([]);
  } finally {
    delay.disable();
    controllers.forEach((controller) => controller.abort());
  }
});
