import { Problem } from "../../problem.js";
import { input, mime } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

export async function attachmentsRoutes(ctx: RequestContext): Promise<unknown> {
  const {
    store,
    req,
    url,
    method,
    project,
    kind,
    id,
    headers,
    json,
    bytes,
    mutate,
  } = ctx;
  if (kind === "attachments") {
    if (method === "GET" && id) {
      const data = await store.attachment(project, id);
      const previewPDF =
        data.ext === ".pdf" && url.searchParams.get("preview") === "1";
      return bytes(
        data.bytes,
        mime[data.ext],
        [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(data.ext)
          ? {}
          : previewPDF
            ? {
                "Content-Disposition": `inline; filename="${id}"`,
                "X-Frame-Options": "SAMEORIGIN",
                "Content-Security-Policy": headers[
                  "Content-Security-Policy"
                ].replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
              }
            : { "Content-Disposition": `attachment; filename="${id}"` },
      );
    }
    if (method === "POST" && !id) {
      const data = await input(req);
      return json(201, await mutate(() => store.attach(project, data)));
    }
  }

  throw new Problem(404, "Endpoint not found.");
}
