import test from "node:test";
import assert from "node:assert/strict";
import { boardSession } from "../public/board-session.js";

// The first presence heartbeat can run before the board has loaded. An invitation sent before
// the next heartbeat must survive it rather than being cleared as if the board had changed.
test("an invitation sent while the board is still loading is kept", () => {
  const clicks = [];
  const realDocument = globalThis.document, realInterval = globalThis.setInterval;
  globalThis.document = { addEventListener: (type, fn) => type === "click" && clicks.push(fn), querySelectorAll: () => [] };
  globalThis.setInterval = () => 0;
  try {
    let current;
    const session = boardSession({ state: { camera: {} }, board: () => current, $: () => null, esc: String, toast: () => {}, sync: {}, changeBoard: () => {}, showDialog: () => {}, dialogHead: () => "", closeDialog: () => {} }, { pick: () => [], busy: () => false });
    session.payload();
    current = { id: "b-1", nodes: [], settings: {} };
    const invite = { dataset: { session: "invite" } };
    for (const click of clicks) click({ target: { closest: (selector) => (selector.includes("[data-session]") && !selector.includes("dismiss") ? invite : null) } });
    assert.ok(session.payload().invite > 0, "the invitation is still being sent");
  } finally {
    globalThis.document = realDocument;
    globalThis.setInterval = realInterval;
  }
});
