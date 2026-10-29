import { BOARD_LIMITS } from "../../public/board-limits.js";
import { validDependencyStyle } from "../../public/dependency-style.js";
import { validDraftTask } from "../../public/draft-task.js";
import { validTimelineRange } from "../../public/timeline-dates.js";
import { commentReactions } from "../../public/comment-model.js";
import { validObjectGeometry } from "../../public/object-geometry.js";
import { validConnectorGeometry } from "../../public/connector-path.js";
import { validTextStyle } from "../../public/object-text.js";
import { validGrid } from "../../public/grid-model.js";
import { randomUUID } from "node:crypto";
import { checkStroke } from "../strokes.js";
import { Problem } from "../problem.js";
import { now, validId, title, body, choice, color } from "../values.js";

export const boardsMethods = {
  validateBoard(data) {
    if (
      data.settings?.dependency_style !== undefined &&
      !validDependencyStyle(data.settings.dependency_style)
    )
      throw new Problem(400, "Invalid dependency arrow style.");
    title(data.title);
    if (
      data.settings !== undefined &&
      (!data.settings ||
        typeof data.settings !== "object" ||
        Array.isArray(data.settings) ||
        ["snap", "alignObjects"].some(
          (key) =>
            data.settings[key] !== undefined &&
            typeof data.settings[key] !== "boolean",
        ))
    )
      throw new Problem(
        400,
        "Board settings must be an object with boolean snapping options.",
      );
    if (
      data.layers != null &&
      (!Array.isArray(data.layers) ||
        data.layers.length > 100 ||
        data.layers.some(
          (l) =>
            !l ||
            typeof l.id !== "string" ||
            !/^[\w-]{1,100}$/.test(l.id) ||
            typeof l.name !== "string" ||
            l.name.length > 80 ||
            (l.hidden != null && typeof l.hidden !== "boolean") ||
            (l.locked != null && typeof l.locked !== "boolean"),
        ))
    )
      throw new Problem(400, "Invalid layers.");
    const session = data.settings?.session;
    if (
      session != null &&
      (!session ||
        typeof session !== "object" ||
        Array.isArray(session) ||
        (session.timerEnd != null &&
          (!Number.isFinite(session.timerEnd) || session.timerEnd < 0)) ||
        (session.voteLimit != null &&
          (!Number.isInteger(session.voteLimit) ||
            session.voteLimit < 1 ||
            session.voteLimit > 20)) ||
        (session.voting != null && typeof session.voting !== "boolean") ||
        (session.votes != null &&
          (!Array.isArray(session.votes) ||
            session.votes.length > 100 ||
            session.votes.some(
              (v) =>
                !v ||
                typeof v.id !== "string" ||
                v.id.length > 100 ||
                !Array.isArray(v.nodes) ||
                v.nodes.length > 20 ||
                v.nodes.some((id) => typeof id !== "string"),
            ))))
    )
      throw new Problem(400, "Invalid board session.");
    const background = data.settings?.background;
    if (
      background !== undefined &&
      (!background ||
        typeof background !== "object" ||
        Array.isArray(background) ||
        !["plain", "dots", "grid", "fine-grid", "lines"].includes(
          background.pattern,
        ) ||
        ![background.color, background.lineColor].every(
          (value) => value === "auto" || /^#[\da-f]{6}$/i.test(value || ""),
        ) ||
        !Number.isInteger(background.spacing) ||
        background.spacing < 8 ||
        background.spacing > 160)
    )
      throw new Problem(400, "Invalid board background settings.");
    if (
      !Array.isArray(data.nodes) ||
      data.nodes.length > BOARD_LIMITS.nodes ||
      !Array.isArray(data.edges) ||
      data.edges.length > BOARD_LIMITS.edges
    )
      throw new Problem(
        400,
        "A board supports up to 100,000 objects and 200,000 connectors.",
      );
    const ids = new Set();
    for (const node of data.nodes) {
      validId(node.id);
      if (
        node.viewType != null &&
        !["list", "table", "kanban", "timeline"].includes(node.viewType)
      )
        throw new Problem(400, "Invalid embedded task layout.");
      if (
        node.visibleFields != null &&
        (!Array.isArray(node.visibleFields) ||
          node.visibleFields.length > 7 ||
          node.visibleFields.some(
            (f) =>
              ![
                "key",
                "title",
                "status",
                "assignee",
                "due",
                "priority",
                "type",
              ].includes(f),
          ))
      )
        throw new Problem(400, "Invalid embedded task fields.");
      if (
        node.timelineScale != null &&
        !["day", "week", "month"].includes(node.timelineScale)
      )
        throw new Problem(400, "Invalid timeline scale.");
      if (
        node.timelineShowWeekends != null &&
        typeof node.timelineShowWeekends !== "boolean"
      )
        throw new Problem(400, "Invalid timeline weekend setting.");
      if (node.timelineRange != null && !validTimelineRange(node.timelineRange))
        throw new Problem(
          400,
          "Use a valid timeline start/end range of ten years or less.",
        );
      if (!validObjectGeometry(node))
        throw new Problem(400, "Invalid object geometry.");
      if (ids.has(node.id))
        throw new Problem(400, "Duplicate board object ID.");
      ids.add(node.id);
      choice(
        node.type,
        [
          "task",
          "sticky",
          "draft",
          "text",
          "shape",
          "grid",
          "frame",
          "image",
          "draw",
          "file",
          "link",
          "query",
        ],
        "board object",
      );
      for (const key of ["x", "y", "w", "h"])
        if (!Number.isFinite(node[key]) || Math.abs(node[key]) > BOARD_LIMITS.coordinate)
          throw new Problem(400, "Invalid board position.");
      if (node.w < 1 || node.h < 1)
        throw new Problem(400, "Board objects are too small.");
      if (
        node.text != null &&
        (typeof node.text !== "string" || node.text.length > 200000)
      )
        throw new Problem(400, "Board text is too long.");
      if (
        node.projectFrame !== undefined &&
        (typeof node.projectFrame !== "boolean" || node.type !== "frame")
      )
        throw new Problem(400, "Invalid project frame.");
      if (node.projectFrameOwner != null) validId(node.projectFrameOwner);
      if (node.type === "draft" && !validDraftTask(node))
        throw new Problem(400, "Invalid draft task.");
      if (node.type === "grid" && !validGrid(node.grid))
        throw new Problem(
          400,
          "Invalid grid: use 1–30 rows and columns, and at most 6,000 characters per cell.",
        );
      if (!validTextStyle(node))
        throw new Problem(400, "Invalid object text style.");
      if (node.color) color(node.color);
      if (node.textAlign != null)
        choice(
          node.textAlign,
          ["left", "center", "right", "justify"],
          "text alignment",
        );
      if (node.type === "task") validId(node.task);
      if (node.group) validId(node.group);
      if (node.frame) validId(node.frame);
      if (
        node.subpath &&
        (typeof node.subpath !== "string" ||
          !node.subpath.startsWith("#") ||
          node.subpath.length > 300)
      )
        throw new Problem(400, "Invalid embed heading or block.");
      if (
        node.type === "file" &&
        (typeof node.file !== "string" || node.file.length > 1000)
      )
        throw new Problem(400, "Invalid file reference.");
      if (
        node.type === "link" &&
        (typeof node.url !== "string" ||
          !/^https?:\/\//i.test(node.url) ||
          node.url.length > 2000)
      )
        throw new Problem(400, "Use an http or https link.");
      if (
        node.type === "query" &&
        node.query != null &&
        (typeof node.query !== "object" || Array.isArray(node.query))
      )
        throw new Problem(400, "Invalid task view.");
      if (
        node.comments &&
        (!Array.isArray(node.comments) ||
          node.comments.length > 1000 ||
          node.comments.some(
            (c) =>
              typeof c.id !== "string" ||
              typeof c.text !== "string" ||
              c.text.length > 10000 ||
              typeof c.author !== "string" ||
              c.author.length > 100 ||
              (c.replyTo != null &&
                (typeof c.replyTo !== "string" || c.replyTo.length > 200)) ||
              (c.deleted != null && typeof c.deleted !== "boolean") ||
              (c.reactions != null &&
                (!Array.isArray(c.reactions) ||
                  c.reactions.length > 5000 ||
                  c.reactions.some(
                    (r) =>
                      !r ||
                      typeof r.id !== "string" ||
                      r.id.length > 300 ||
                      typeof r.actor !== "string" ||
                      r.actor.length > 200 ||
                      typeof r.author !== "string" ||
                      r.author.length > 100 ||
                      !commentReactions.some(([emoji]) => emoji === r.emoji),
                  ))),
          ))
      )
        throw new Problem(400, "Invalid board comments.");
      if (
        node.type === "image" &&
        (typeof node.src !== "string" ||
          !/^attachments\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp)$/.test(
            node.src,
          ))
      )
        throw new Problem(400, "Use a local image attachment.");
      if (node.type === "draw") checkStroke(node);
    }
    if (data.nodes.filter((n) => n.type === "frame").length > BOARD_LIMITS.frames)
      throw new Problem(400, `A board supports up to ${BOARD_LIMITS.frames.toLocaleString("en-GB")} frames.`);
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const checkedParents = new Set();
    for (const n of data.nodes) {
      const parentNode = byId.get(n.frame);
      if (n.frame && (!parentNode || !["frame", "grid"].includes(parentNode.type)))
        throw new Problem(400, "Invalid frame hierarchy.");
      if (parentNode?.type === "grid" || n.gridCell != null) {
        const c = n.gridCell;
        if (
          parentNode?.type !== "grid" ||
          !c ||
          !Number.isInteger(c.row) ||
          !Number.isInteger(c.column) ||
          !parentNode.grid.cells[c.row]?.[c.column]
        )
          throw new Problem(400, "Invalid grid cell membership.");
      }
      const seen = new Set([n.id]);
      let parent = n.frame;
      while (parent && !checkedParents.has(parent)) {
        const frame = byId.get(parent);
        if (
          !frame ||
          !["frame", "grid"].includes(frame.type) ||
          seen.has(parent)
        )
          throw new Problem(400, "Invalid frame hierarchy.");
        seen.add(parent);
        parent = frame.frame;
      }
      for (const id of seen) checkedParents.add(id);
    }
    const edges = new Set();
    for (const edge of data.edges) {
      validId(edge.id);
      if (edge.projectFrameOwner != null) validId(edge.projectFrameOwner);
      if (edge.planRelation != null)
        choice(
          edge.planRelation,
          ["dependency", "parent"],
          "project frame relationship",
        );
      if (!validConnectorGeometry(edge))
        throw new Problem(400, "Invalid connector geometry.");
      if (
        edges.has(edge.id) ||
        !ids.has(edge.from) ||
        !ids.has(edge.to) ||
        edge.from === edge.to
      )
        throw new Problem(400, "Invalid connector.");
      if (
        edge.label != null &&
        (typeof edge.label !== "string" || edge.label.length > 500)
      )
        throw new Problem(400, "Connector labels must be short text.");
      for (const key of ["fromSide", "toSide"])
        if (edge[key] != null)
          choice(
            edge[key],
            ["top", "right", "bottom", "left"],
            "connector side",
          );
      for (const key of ["fromEnd", "toEnd"])
        if (edge[key] != null)
          choice(
            edge[key],
            [
              "none",
              "arrow",
              "triangle",
              "circle",
              "circle-outline",
              "diamond",
              "diamond-outline",
              "bar",
            ],
            "arrow style",
          );
      if (edge.width != null)
        choice(edge.width, [1, 2, 3, 5], "line thickness");
      if (edge.lineStyle != null)
        choice(edge.lineStyle, ["solid", "dashed", "dotted"], "line style");
      if (edge.routing)
        choice(edge.routing, ["curve", "elbow", "straight"], "connector route");
      if (edge.relationship)
        choice(
          edge.relationship,
          ["relates", "blocks", "contains", "sequence"],
          "relationship",
        );
      if (edge.color && !/^[1-6]$/.test(edge.color)) color(edge.color);
      edges.add(edge.id);
    }
  },
  async createBoard(project, input) {
    await this.read(this.file(project, "project"));
    const id = `b-${randomUUID().slice(0, 8)}`;
    return this.write(
      this.file(project, "boards", id),
      {
        id,
        kind: "board",
        project,
        title: title(input.title),
        nodes: [],
        edges: [],
        created: now(),
        updated: now(),
      },
      "",
    );
  },
  async updateBoard(project, id, input) {
    const file = this.file(project, "boards", id),
      current = await this.read(file);
    this.checkRevision(current, input.revision);
    const data = { ...current.data, updated: now() };
    for (const key of ["title", "nodes", "edges", "archived"])
      if (key in input) data[key] = input[key];
    this.validateBoard(data);
    return this.write(file, data, current.body, current);
  },
};
