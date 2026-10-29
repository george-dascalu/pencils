import { createHash } from "node:crypto";
import { Problem } from "./problem.js";
export const STATUSES = ["backlog", "todo", "in-progress", "review", "done"];
export { DEFAULT_TASK_TYPES as TYPES } from "../public/task-types.js";
export const PRIORITIES = ["none", "low", "medium", "high", "urgent"];
export const DEFAULT_ORGANISATION = "o-default";
export const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
export const now = () => new Date().toISOString();
export const hash = (text) => createHash("sha256").update(text).digest("hex");
// Each account's personal space is an organisation whose ID comes from the username,
// so access checks can tell whose it is without reading the record.
export const personalOrganisation = (username) => `o-personal-${hash(`personal:${username}`).slice(0, 16)}`;
export const isPersonalOrganisation = (id) => typeof id === "string" && id.startsWith("o-personal-");
export function validId(id) {
  if (typeof id !== "string" || !idPattern.test(id))
    throw new Problem(400, "Invalid identifier.");
  return id;
}
export function title(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 300)
    throw new Problem(400, "A title between 1 and 300 characters is required.");
  return value.trim();
}
export function body(value) {
  if (typeof value !== "string" || value.length > 200_000)
    throw new Problem(
      400,
      "Description must be text, up to 200,000 characters.",
    );
  return value;
}
export function choice(value, choices, label) {
  if (!choices.includes(value)) throw new Problem(400, `Invalid ${label}.`);
  return value;
}
export function date(value) {
  if (value === "" || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Problem(400, "Use a valid YYYY-MM-DD date.");
  return value;
}
export function tags(value) {
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some((t) => typeof t !== "string" || t.length > 80)
  )
    throw new Problem(400, "Tags must be a list of short strings.");
  return [...new Set(value.map((t) => t.trim()).filter(Boolean))];
}
export function color(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Problem(400, "Use a six-digit hex color.");
  return value;
}
