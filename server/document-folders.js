import { Problem } from "./problem.js";

// Folders for documents and, since 0.20.74, boards (noun names the kind in messages).
export function documentFolders(value, noun = "document") {
  if (!Array.isArray(value) || value.length > 500)
    throw new Problem(400, `Use up to 500 ${noun} folders.`);
  const folders = value.map(folder => {
    if (!folder || typeof folder.id !== "string" || !/^[\w-]{1,80}$/.test(folder.id) ||
        typeof folder.title !== "string" || !folder.title.trim() || folder.title.length > 100 ||
        /[\\/\u0000-\u001f]/.test(folder.title) || ["..", "."].includes(folder.title.trim()) ||
        (folder.parent != null && typeof folder.parent !== "string"))
      throw new Problem(400, "Give each folder a valid name and identifier.");
    return { id: folder.id, title: folder.title.trim(), parent: folder.parent || null };
  });
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  if (byId.size !== folders.length) throw new Problem(400, "Folder identifiers must be unique.");
  const names = new Set();
  for (const folder of folders) {
    const key = JSON.stringify([folder.parent, folder.title.toLocaleLowerCase()]);
    if (names.has(key)) throw new Problem(400, "A folder with this name already exists here.");
    names.add(key);
    const seen = new Set([folder.id]);
    let parent = folder.parent;
    while (parent) {
      if (!byId.has(parent) || seen.has(parent)) throw new Problem(400, "Choose a parent outside this folder.");
      seen.add(parent);
      if (seen.size > 12) throw new Problem(400, "Use up to 12 folder levels.");
      parent = byId.get(parent).parent;
    }
  }
  return folders;
}

export function documentFolder(value, folders = [], noun = "document") {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !folders.some(folder => folder.id === value))
    throw new Problem(400, `Choose a ${noun} folder in this project.`);
  return value;
}
