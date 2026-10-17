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
