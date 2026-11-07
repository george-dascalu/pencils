// @ts-check
// Text made safe for HTML built as a string, in text and in quoted attributes.
/** @param {unknown} value */
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
