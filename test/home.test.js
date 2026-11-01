// The personal Home (owner request T22, 31 October 2026): a per-person grid of panels kept on the
// server, visits for the Recent and Most visited panels, the framing check behind the Web page
// panel, and the grid's push-down placement shared with the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../server/store.js";
import { Home, defaultPanels, PANEL_TYPES } from "../server/home.js";
import { Visits } from "../server/visits.js";
import { framingAllowed, privateAddress, checkEmbed, fetchEmbed } from "../server/embed-check.js";
import { compact, stackOrder } from "../public/home-grid.js";

const user = { username: "george", name: "George" };
async function store() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-home-"));
  const s = new Store(root);
  await s.init();
  return s;
}
const fakeBookmarks = { resolve: async (u, b) => (b.id === "gone" ? null : { kind: b.kind, project: b.project, id: b.id, title: `Title of ${b.id}` }) };

test("a person without a layout gets the default panels, and a saved layout comes back as saved", async () => {
  const home = new Home(await store());
  const first = await home.list(user);
  assert.deepEqual(first.panels.map((p) => p.type), defaultPanels().map((p) => p.type));
  assert.ok(first.panels.every((p) => PANEL_TYPES.includes(p.type)));
  const panels = [{ id: "a", type: "note", x: 0, y: 0, w: 6, h: 4, settings: { text: "Hello" } }, { id: "b", type: "stat", x: 6, y: 0, w: 3, h: 3, settings: {} }];
  await home.replace(user, { panels });
  assert.deepEqual((await home.list(user)).panels, panels);
  assert.deepEqual((await home.list({ username: "other" })).panels.map((p) => p.type), defaultPanels().map((p) => p.type), "layouts are per person");
});

test("a layout is validated: known types, panels inside the 12 columns, a limit, and settings kept to known keys", async () => {
  const home = new Home(await store());
  const bad = async (panels, message) => assert.rejects(() => home.replace(user, { panels }), (e) => e.status === 400, message);
  await bad([{ id: "a", type: "weather", x: 0, y: 0, w: 4, h: 4 }], "unknown type");
  await bad([{ id: "a", type: "note", x: 10, y: 0, w: 4, h: 4 }], "past the right edge");
  await bad([{ id: "a", type: "note", x: 0, y: 0, w: 0, h: 4 }], "no width");
  await bad([{ id: "a", type: "note", x: 0, y: 0, w: 4, h: 4 }, { id: "a", type: "note", x: 0, y: 4, w: 4, h: 4 }], "duplicate id");
  await bad(Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, type: "note", x: 0, y: i * 2, w: 4, h: 2 })), "too many");
  await bad([{ id: "a", type: "web", x: 0, y: 0, w: 4, h: 4, settings: { url: "javascript:alert(1)" } }], "web needs an http(s) address");
  await home.replace(user, { panels: [{ id: "a", type: "note", x: 0, y: 0, w: 4, h: 4, settings: { text: "x", bogus: 1 } }] });
  assert.deepEqual((await home.list(user)).panels[0].settings, { text: "x" }, "unknown settings are dropped");
});

test("visits give a recent list, newest first and unique, and most visited counts within a window, leaving out what is gone", async () => {
  const visits = new Visits(await store(), fakeBookmarks);
  const at = (days) => new Date(Date.now() - days * 864e5).toISOString();
  for (const [id, when] of [["one", 40], ["two", 2], ["one", 1], ["gone", 0.5], ["two", 0.2]]) await visits.record(user, { kind: "card", project: "p1", id }, at(when));
  const { recent, visited } = await visits.list(user, { days: 30 });
  assert.deepEqual(recent.map((v) => v.id), ["two", "one"], "unique, newest first, gone items left out");
  assert.equal(recent[0].title, "Title of two");
  assert.deepEqual(visited.map((v) => [v.id, v.count]), [["two", 2], ["one", 1]], "counts within 30 days");
  assert.deepEqual((await visits.list({ username: "other" })).recent, []);
});

test("a visit list stays bounded per person", async () => {
  const visits = new Visits(await store(), fakeBookmarks);
  for (let i = 0; i < 600; i++) await visits.record(user, { kind: "doc", project: "p1", id: `d${i}` });
  assert.ok((await visits.all())[user.username].length <= 500);
});

test("framing is refused by X-Frame-Options or frame-ancestors, and allowed otherwise", () => {
  assert.equal(framingAllowed({ "x-frame-options": "DENY" }), false);
  assert.equal(framingAllowed({ "x-frame-options": "sameorigin" }), false);
  assert.equal(framingAllowed({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }), false);
  assert.equal(framingAllowed({ "content-security-policy": "frame-ancestors 'self' https://example.com" }), false);
  assert.equal(framingAllowed({ "content-security-policy": "frame-ancestors *" }), true);
  assert.equal(framingAllowed({ "content-security-policy": "default-src 'self'" }), true);
  assert.equal(framingAllowed({}), true);
});

test("private, loopback and link-local addresses are refused by the embed check unless allowed", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.2", "172.16.0.9", "169.254.1.1", "100.64.0.1", "::1", "::", "fd00::1", "fe90::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::7f00:1", "64:ff9b::7f00:1", "0.0.0.0"]) assert.equal(privateAddress(ip), true, ip);
  for (const ip of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:5db8:d822"]) assert.equal(privateAddress(ip), false, ip);
  const lookup = async () => [{ address: "127.0.0.1", family: 4 }];
  await assert.rejects(() => checkEmbed("http://internal.test/", { lookup, fetch: async () => { throw new Error("must not fetch"); } }), (e) => e.status === 400);
  await assert.rejects(() => checkEmbed("ftp://example.com/", { lookup }), (e) => e.status === 400);
  const headers = new Map([["content-type", "text/html"], ["x-frame-options", "DENY"]]);
  const fetch = async () => ({ ok: true, headers: { get: (k) => headers.get(k) }, body: null, text: async () => "<html><head><title>Internal page</title></head></html>" });
  assert.deepEqual(await checkEmbed("http://internal.test/", { lookup, fetch, allowPrivate: true }), { embeddable: false, title: "Internal page" });
  // A redirect to a private address is refused at that hop, and the app's own host always is.
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const redirecting = async () => ({ status: 302, headers: { get: (k) => (k === "location" ? "http://127.0.0.1/admin" : null) }, body: null });
  await assert.rejects(() => checkEmbed("http://example.com/", { lookup: publicLookup, fetch: redirecting }), (e) => e.status === 400 && /Private/.test(e.message));
  await assert.rejects(() => checkEmbed("http://pencils.test:3000/x", { lookup: publicLookup, self: "pencils.test:3000" }), (e) => e.status === 400 && /own pages/.test(e.message));
});

test("embed connections use the checked DNS addresses, including after redirects", async () => {
  const addresses = [{ address: "93.184.216.34", family: 4 }];
  let calls = 0;
  await checkEmbed("https://example.com/", {
    lookup: async () => addresses,
    fetch: async (url, options) => {
      assert.deepEqual(options.addresses, addresses, "the transport must not resolve the hostname again");
      calls++;
      return new Response(calls === 1 ? "" : "<title>Checked</title>", { status: calls === 1 ? 302 : 200, headers: calls === 1 ? { location: "https://another.example/" } : { "content-type": "text/html" } });
    },
  });
  assert.equal(calls, 2);
});
test("the embed transport connects to the pinned address without resolving the hostname again", async t => {
  const server = http.createServer((req, res) => { res.setHeader("x-frame-options", "DENY"); res.end(req.headers.host); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = new URL(`http://does-not-resolve.invalid:${server.address().port}/`);
  const response = await fetchEmbed(url, { addresses: [{ address: "127.0.0.1", family: 4 }], signal: AbortSignal.timeout(3000), headers: {} });
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(await new Response(response.body).text(), url.host);
  assert.deepEqual(await checkEmbed(`http://localhost:${server.address().port}`, { allowPrivate: true }), { embeddable: false, title: "" });
  await assert.rejects(fetchEmbed(url, { addresses: [{ address: "127.0.0.1", family: 4 }], signal: AbortSignal.abort(), headers: {} }), { name: "AbortError" });
});
test("embed checks refuse local names before lookup, empty DNS answers, network failures and redirect loops", async () => {
  let lookups = 0, requests = 0;
  const lookup = async () => { lookups++; return [{ address: "93.184.216.34", family: 4 }]; };
  const fetch = async () => { requests++; return new Response(""); };
  for (const host of ["localhost", "x.localhost", "x.local"]) await assert.rejects(checkEmbed(`http://${host}`, { lookup, fetch }), /Private/);
  assert.equal(lookups, 0);
  await assert.rejects(checkEmbed("http://example.test", { lookup: async () => [], fetch }), /Private/);
  assert.equal(requests, 0);
  await assert.rejects(checkEmbed("http://example.test", { lookup: async () => { throw Error("DNS failed"); }, fetch }), /could not be found/);
  await assert.rejects(checkEmbed("http://example.test", { lookup, fetch: async () => { throw Error("Network failed"); } }), /could not be reached/);
  let redirects = 0;
  await assert.rejects(checkEmbed("http://example.test", { lookup, fetch: async () => { redirects++; return new Response("", { status: 302, headers: { location: "http://example.test" } }); } }), /redirects too often/);
  assert.equal(redirects, 4);
});

test("the grid pushes overlapped panels down and keeps a reading order", () => {
  const panels = [
    { id: "a", x: 0, y: 0, w: 6, h: 4 },
    { id: "b", x: 6, y: 0, w: 6, h: 4 },
    { id: "c", x: 0, y: 4, w: 12, h: 2 },
  ];
  // b is dropped onto a: b keeps its place, a goes under it, and c follows below both.
  const moved = compact(panels.map((p) => (p.id === "b" ? { ...p, x: 0, y: 1 } : p)), "b");
  assert.deepEqual(moved.map((p) => [p.id, p.x, p.y]), [["a", 0, 5], ["b", 0, 1], ["c", 0, 9]]);
  assert.deepEqual(stackOrder([{ id: "x", x: 6, y: 0 }, { id: "y", x: 0, y: 2 }, { id: "z", x: 0, y: 0 }]).map((p) => p.id), ["z", "x", "y"]);
});
