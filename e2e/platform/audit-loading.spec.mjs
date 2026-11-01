import { test, expect, useApp, onDevices } from "../fixtures.mjs";
import { documentTool } from "../helpers/documents.mjs";

const app = useApp(async store => {
  const project = await store.createProject({ title: "Lazy loading" });
  await store.createTask(project.id, { title: "A small task list" });
  const boards = [(await store.snapshot(project.id)).boards[0], await store.createBoard(project.id, { title: "Closed board" })];
  for (const board of boards) await store.updateBoard(project.id, board.id, { revision: board.revision,
    nodes: Array.from({ length: 1000 }, (_, i) => ({ id: `n${i}`, type: "sticky", text: `Note ${i}`, x: (i % 100) * 220, y: Math.floor(i / 100) * 140, w: 200, h: 120 })), edges: [] });
  let doc = await store.createDocument(project.id, { title: "Many versions", body: "Original text" });
  for (let i = 0; i < 25; i++) doc = await store.updateDocument(project.id, doc.id, { revision: doc.revision, body: `Revision ${i}` });
  return { project, boards, doc };
});

onDevices(["desktop", "phone", "ipad"], () => {
  test("task views load board summaries; opening one board loads only its contents", async ({ page }) => {
    const responses = [];
    page.on("response", response => { if (new URL(response.url()).pathname === `/api/projects/${app.project.id}`) responses.push(response.json()); });
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await expect(page.locator("#view-content")).toContainText("A small task list");
    const snapshots = await Promise.all(responses);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every(s => s.boards.every(b => b.summary && !b.nodes))).toBe(true);
    await page.goto(`${app.base}/#project/${app.project.id}/board/${app.boards[0].id}`);
    await expect(page.locator('#canvas [data-node="n0"]')).toBeVisible();
    const opened = (await Promise.all(responses)).find(s => s.boards.some(b => b.nodes?.length));
    expect(opened.boards.find(b => b.id === app.boards[0].id).nodes).toHaveLength(1000);
    expect(opened.boards.find(b => b.id === app.boards[1].id).nodes).toBeUndefined();
  });
  test("document history pages summaries and loads a chosen old version", async ({ page }) => {
    const responses = [];
    page.on("response", response => { if (new URL(response.url()).pathname === "/api/history") responses.push(response.json()); });
    await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
    await page.locator(".cm-content").waitFor();
    await documentTool(page, "Page versions");
    const panel = page.getByRole("dialog", { name: "Page versions", exact: true });
    await expect(panel.locator("[data-version-index]")).toHaveCount(21);
    await panel.getByRole("button", { name: "Load older versions" }).click();
    await expect(panel.locator("[data-version-index]")).toHaveCount(26);
    expect((await Promise.all(responses)).every(p => p.versions?.every(v => v.body === undefined))).toBe(true);
    await panel.locator("[data-version-index]").last().click();
    await expect(panel.locator(".document-version-detail")).toContainText("Original text");
    expect((await Promise.all(responses)).filter(v => v.body !== undefined)).toHaveLength(1);
  });
});
