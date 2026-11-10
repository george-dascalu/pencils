// Owner request (F0.23-3): every view and page runs under the floating bottom bar on iPad and phones,
// like List and Tree: its scroller reaches the bottom of the screen and its last item scrolls clear
// of the bar.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const organisation = await store.createOrganisation({ title: "Bar", people: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, capacity: 40 })) });
  const project = await store.createProject({ title: "Under the bar", key: "UB", organisation: organisation.id, people: Array.from({ length: 24 }, (_, i) => `p${i}`) });
  let parent = null;
  for (let i = 0; i < 60; i++) {
    const card = await store.createTask(project.id, { title: `Card ${i} with a title long enough to fill the row`, status: ["todo", "in-progress", "done"][i % 3], assignee: `Person ${i % 24}`, start: "2026-11-02", due: `2026-11-0${2 + (i % 5)}`, estimate: 3, parent: i % 4 ? parent?.id : undefined });
    if (i % 4 === 0) parent = card;
  }
  const doc = await store.createDocument(project.id, { title: "Long read", body: Array.from({ length: 120 }, (_, i) => `Paragraph ${i} of a long document.`).join("\n\n") });
  return { project, doc };
});

// The largest element that scrolls up and down, how far it reaches, and where its last item ends
// once scrolled to the end, against the bar's top.
const measure = (page) => page.evaluate(async () => {
  const tabs = document.querySelector(".topbar .tabs");
  if (!tabs?.getClientRects().length) return { found: false, nobar: true };
  const bar = tabs.getBoundingClientRect();
  const scrollers = [...document.querySelectorAll(".main *")].filter((el) => {
    const style = getComputedStyle(el), r = el.getBoundingClientRect();
    return /auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1 && r.height > innerHeight / 3 && !el.closest(".topbar, dialog, .sidebar");
  });
  const el = scrollers.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (!el) return { found: false };
  // To the end at once, then until it stays put (content may load as it goes).
  el.style.scrollBehavior = "auto";
  for (let i = 0, was = -1; i < 30 && el.scrollTop !== was; i++) {
    was = el.scrollTop;
    el.scrollTop = el.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  // Only what this scroller moves: items inside a nested scroller or a clipped box don't count.
  const own = (c) => { for (let a = c.parentElement; a && a !== el; a = a.parentElement) if (getComputedStyle(a).overflowY !== "visible") return false; return true; };
  // Leaves (text and controls), as a box's own bottom padding is the clearance itself.
  const items = [...el.querySelectorAll("*")].filter((c) => !c.firstElementChild && own(c) && c.getClientRects().length && c.getBoundingClientRect().height > 1 && c.getBoundingClientRect().width > 1 && getComputedStyle(c).visibility !== "hidden" && !/fixed|sticky/.test(getComputedStyle(c).position));
  const lastItem = items.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0], last = lastItem?.getBoundingClientRect().bottom ?? 0;
  const name = el.id ? `#${el.id}` : `.${[...el.classList].join(".")}`;
  return { found: true, name, bottom: Math.round(el.getBoundingClientRect().bottom), height: innerHeight, last: Math.round(last), barTop: Math.round(bar.top), lastItem: `${lastItem?.tagName}.${[...(lastItem?.classList || [])].join(".")} top ${Math.round(el.scrollTop)}/${el.scrollHeight - el.clientHeight}` };
});

const PAGES = [
  ["overview", (p) => `#project/${p.project.id}/overview`, ".project-overview"],
  ["list", (p) => `#project/${p.project.id}/list`, ".task-row"],
  ["tree", (p) => `#project/${p.project.id}/tree`, ".task-row"],
  ["table", (p) => `#project/${p.project.id}/table`, "[data-table-task]"],
  ["kanban", (p) => `#project/${p.project.id}/kanban`, ".kanban-column"],
  ["document", (p) => `#project/${p.project.id}/documents/${p.doc.id}`, ".document-writing, .document-codemirror"],
  ["timeline", (p) => `#project/${p.project.id}/timeline`, ".task-timeline"],
  ["capacity", (p) => `#project/${p.project.id}/capacity`, "#view-content[data-layout-view='capacity']"],
  ["settings", (p) => `#project/${p.project.id}/settings/organisation`, ".settings-content, #settings-panel"],
  ["home", () => "#home", ".home-grid"],
  ["help", () => "#help/miro", ".help-page"],
  ["roadmap", () => "#help/roadmap", ".help-page"],
];

// A page can still redraw once after it first shows (Settings loads its section, views refresh), so
// each page is measured until it holds, and every page reports.
const soft = expect.configure({ soft: true, timeout: 8000 });
onDevices(["ipad", "phone"], () => {
  test("every view and page runs under the bar and scrolls its last item clear of it", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-04T12:00:00"));
    for (const [name, url, ready] of PAGES) {
      await page.goto(`${app.base}/${url(app)}`);
      await page.locator(ready).first().waitFor();
      await page.locator(".settings-loading").waitFor({ state: "detached" });
      await soft.poll(async () => {
        const m = await measure(page);
        if (m.nobar || !m.found) return ""; // a page that hides the bar (Help), or nothing long enough to scroll
        return [m.bottom < m.height - 6 && `${m.name} stops ${m.height - m.bottom}px above the bottom`, m.last > m.barTop + 1 && `${m.name}'s last item (${m.lastItem}) ends ${m.last - m.barTop}px under the bar`].filter(Boolean).join("; ");
      }, { message: name }).toBe("");
    }
  });
});
