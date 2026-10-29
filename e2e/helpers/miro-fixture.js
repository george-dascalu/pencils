import assert from "node:assert/strict";
export const miroBoard = "uXjExample=";
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS00AAAAASUVORK5CYII=",
  "base64",
);
const item = (id, type, data, x, y, extra = {}) => ({
  id,
  type,
  data,
  position: { x, y, origin: "center", relativeTo: "canvas_center" },
  geometry: { width: 200, height: 120 },
  ...extra,
});
export function miroFixture() {
  return {
    board: { id: miroBoard, name: "Miro migration lab" },
    members: [{ id: "user-a", name: "Alice" }],
    items: [
      item("frame", "frame", { title: "Product plan" }, 0, 0, {
        geometry: { width: 1200, height: 800 },
      }),
      item(
        "note",
        "sticky_note",
        {
          content:
            "<p><strong>A useful idea</strong></p><ul><li>First point</li></ul>",
        },
        150,
        100,
        {
          parent: { id: "frame" },
          position: { x: 150, y: 100, relativeTo: "parent_top_left" },
          style: {
            fillColor: "light_yellow",
            textAlign: "left",
            textAlignVertical: "middle",
          },
        },
      ),
      item(
        "text",
        "text",
        {
          content:
            '<h2>Scope</h2><p><em>Editable text</em> <a href="https://example.com">Reference</a></p>',
        },
        0,
        -100,
        { style: { fontSize: "24", fontFamily: "arial" } },
      ),
      item(
        "shape",
        "shape",
        { shape: "rhombus", content: "<p>Decision</p>" },
        200,
        0,
        {
          style: {
            fillColor: "#a6ccf5",
            borderColor: "#264653",
            borderWidth: "3",
            borderStyle: "dashed",
          },
        },
      ),
      item("nested", "frame", { title: "Nested frame" }, 700, 350, {
        parent: { id: "frame" },
        position: { x: 700, y: 350, relativeTo: "parent_top_left" },
        geometry: { width: 350, height: 250 },
      }),
      item(
        "card",
        "card",
        {
          title: "Deliver release",
          description: "<p>Card description</p>",
          dueDate: "2026-11-01T00:00:00Z",
          assigneeId: "user-a",
        },
        120,
        100,
        {
          parent: { id: "nested" },
          position: { x: 120, y: 100, relativeTo: "parent_top_left" },
        },
      ),
      item(
        "app",
        "app_card",
        {
          title: "External issue",
          status: "connected",
          fields: [{ title: "Owner", value: "Original owner" }],
        },
        450,
        0,
      ),
      item(
        "image",
        "image",
        {
          title: "Image",
          imageUrl: `https://api.miro.com/v2/boards/${miroBoard}/resources/images/1?format=preview&redirect=false`,
        },
        700,
        0,
      ),
      item(
        "pdf",
        "document",
        {
          title: "Brief.pdf",
          documentUrl: `https://api.miro.com/v2/boards/${miroBoard}/resources/2?redirect=false`,
        },
        950,
        0,
      ),
      item(
        "embed",
        "embed",
        { title: "Video", url: "https://example.com/video" },
        1200,
        0,
      ),
      item("stroke", "stroke", {}, 1450, 0),
      item("table", "table", { title: "Planning table" }, 1700, 0),
    ],
    connectors: [
      {
        id: "line",
        type: "connector",
        startItem: { id: "note", snapTo: "right" },
        endItem: { id: "card", snapTo: "left" },
        shape: "elbowed",
        captions: [{ content: "<p>Supports</p>" }],
        style: {
          startStrokeCap: "none",
          endStrokeCap: "filled_diamond",
          strokeColor: "#264653",
          strokeStyle: "dashed",
          strokeWidth: "3",
        },
      },
      {
        id: "loose",
        type: "connector",
        startItem: { id: "shape" },
        isSupported: false,
      },
    ],
    assets: {},
  };
}
export function miroFetch(snapshot = miroFixture(), requests = []) {
  return async (raw, options = {}) => {
    const url = new URL(raw),
      pathname = decodeURIComponent(url.pathname);
    requests.push({
      url: url.href,
      method: options.method || "GET",
      authorization: options.headers?.Authorization,
    });
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.hostname === "mirostatic.com") {
      assert.equal(
        options.headers?.Authorization,
        undefined,
        "Miro credentials must not reach its CDN",
      );
      return new Response(
        pathname.endsWith(".pdf")
          ? Buffer.from("%PDF-1.4\nTest document\n%%EOF")
          : png,
        {
          headers: {
            "Content-Type": pathname.endsWith(".pdf")
              ? "application/pdf"
              : "image/png",
          },
        },
      );
    }
    assert.equal(url.origin, "https://api.miro.com");
    if (pathname === "/v1/oauth/token")
      return json({
        access_token: "fixture-access-token",
        scope: "boards:read",
        expires_in: 3600,
      });
    if (!options.headers?.Authorization?.startsWith("Bearer "))
      return json({}, 401);
    if (pathname === "/v2/boards") return json({ data: [snapshot.board] });
    const base = `/v2/boards/${miroBoard}`;
    if (pathname === base) return json(snapshot.board);
    if (pathname === `${base}/items`) {
      const index = Number(url.searchParams.get("cursor") || 0),
        data = snapshot.items
          .slice(index, index + 5)
          .map(({ style, ...i }) => i);
      return json({
        data,
        cursor:
          index + 5 < snapshot.items.length ? String(index + 5) : undefined,
      });
    }
    if (pathname === `${base}/connectors`)
      return json({ data: snapshot.connectors });
    if (pathname === `${base}/members`)
      return json({ data: snapshot.members, total: snapshot.members.length });
    if (pathname.includes("/resources/"))
      return json({
        url: `https://mirostatic.com/${pathname.endsWith("/2") ? "brief.pdf" : "image.png"}`,
      });
    const id = pathname.split("/").pop(),
      found = snapshot.items.find((i) => i.id === id);
    if (found) return json(found);
    return json({}, 404);
  };
}
