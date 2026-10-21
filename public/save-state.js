// Shared language for durable browser drafts and confirmed server writes.
export function saveState(
  entries = [],
  { storageError = false, online = true } = {},
) {
  if (storageError) return "Browser draft storage full — keep this tab open";
  if (entries.some((e) => e.conflict))
    return "Conflict — changes kept in Recovery";
  const failed = entries.find((e) => e.error);
  if (failed)
    return online
      ? `Pending — changes kept in this browser: ${failed.error}`
      : "Pending offline — changes kept in this browser";
  return entries.length ? "Saving…" : "Saved automatically";
}

// Actionable details for the compact header warning. Keep editor save labels intact.
export function saveIssue(entries = [], { storageError = false, online = true } = {}) {
  if (storageError) return {
    title: "Browser draft could not be stored",
    cause: "Browser storage is full or unavailable. The latest changes may only be in this tab.",
    action: "Keep this tab open and export the draft from Recovery & backups. Free browser storage or reconnect to the server, then retry saving.",
  };
  if (entries.some(e => e.conflict)) return {
    title: "Conflicting edits need review",
    cause: "This browser and another editor changed the same content. Your changes are kept in this browser.",
    action: "Open Recovery & backups, compare the conflicting values and choose which to keep.",
  };
  const failed = entries.find(e => e.error);
  if (!online) return {
    title: "Server unavailable",
    cause: entries.length ? "The server could not be reached. Unsaved changes are kept in this browser." : "The server could not be reached.",
    action: "Check that Pencils is running and this device is connected to its network. Pending saves retry when the connection returns.",
  };
  if (!failed) return null;
  const frames = failed.error.match(/supports up to ([\d,]+) frames/i);
  if (frames) {
    const count = failed.local?.nodes?.filter(n => n.type === "frame").length;
    const name = failed.local?.title ? `“${failed.local.title}”` : "This board";
    return {
      title: "Frame limit reached",
      cause: `${count == null ? "The attempted save contains more than" : `${name} has ${count.toLocaleString("en-GB")} frames, exceeding the limit of`} ${frames[1]} frames per board. Changes are kept in this browser, but have not reached the server.`,
      action: `Export the draft from Recovery & backups if you need a copy, then remove extra frames so this board has ${frames[1]} or fewer. Saving retries after the edit.`,
    };
  }
  return {
    title: "Changes could not be saved",
    cause: `${failed.error} Changes are kept in this browser.`,
    action: failed.blocked
      ? "Correct the issue, then edit again or choose Retry in Recovery & backups. Export the draft there if you need a copy."
      : "Saving will retry automatically. If the problem continues, open Recovery & backups to export the draft or retry manually.",
  };
}
