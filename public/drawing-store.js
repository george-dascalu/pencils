// Large drawing checkpoints are kept outside localStorage's small quota.
let connection;
function database() {
  return (connection ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("pencils-drawings", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("documents", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function drawingCheckpoint(
  owner,
  project,
  board,
  pending = true,
  { protectPending = false, expectedUpdated = null } = {},
) {
  // Snapshot before awaiting IndexedDB: a canvas may be edited or switched meanwhile.
  project = structuredClone(project);
  board = structuredClone(board);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    const store = tx.objectStore("documents"),
      key = `${owner}/${project.id}/${board.id}`,
      previous = store.get(key);
    let written = false;
    previous.onsuccess = () => {
      if (
        protectPending &&
        previous.result?.pending &&
        previous.result.updated !== expectedUpdated
      )
        return;
      written = true;
      store.put({
        key,
        owner,
        project: {
          id: project.id,
          title: project.title,
          organisation: project.organisation,
        },
        board: structuredClone(board),
        base: pending
          ? previous.result?.base ||
            previous.result?.board ||
            structuredClone(board)
          : structuredClone(board),
        pending,
        updated: Math.max(Date.now(), (previous.result?.updated || 0) + 1),
      });
    };
    tx.oncomplete = () => resolve(written);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function localDrawings(owner) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("documents")
      .objectStore("documents")
      .getAll();
    request.onsuccess = () =>
      resolve(request.result.filter((r) => r.owner === owner));
    request.onerror = () => reject(request.error);
  });
}
export async function removeDrawingCheckpoint(key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    tx.objectStore("documents").delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function localDrawing(owner, project, board) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("documents")
      .objectStore("documents")
      .get(`${owner}/${project}/${board}`);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
