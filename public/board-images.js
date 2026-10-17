export const boardImageAccept =
  ".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp";

// Read dimensions without re-encoding: animated GIFs retain their original frames.
async function readImage(file) {
  if (!/\.(png|jpe?g|gif|webp)$/i.test(file.name))
    throw new Error("Choose a PNG, JPG, GIF or WebP image.");
  if (!file.size || file.size > 10_000_000)
    throw new Error("Choose an image up to 10 MB.");
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let raw = "";
    for (let i = 0; i < bytes.length; i += 8192)
      raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      data: btoa(raw),
    };
  } catch {
    throw new Error("This image could not be opened. Choose another file.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function boardImages(ctx, { point, uid, select, finishEditing }) {
  const { state, board, $, api, route, toast, changeBoard } = ctx;
  let uploading = false;
  const active = () =>
    ["board", "drawing"].includes(state.view) &&
    !state.dialog &&
    board() &&
    $("#canvas");
  function destination(position) {
    const canvas = active();
    if (!canvas || !finishEditing()) return null;
    return {
      project: state.project.id,
      board: board().id,
      url: route("attachments"),
      position:
        position ||
        point({
          clientX: canvas.getBoundingClientRect().left + canvas.clientWidth / 2,
          clientY: canvas.getBoundingClientRect().top + canvas.clientHeight / 2,
        }),
      maxWidth: Math.max(
        80,
        Math.min(480, (canvas.clientWidth - 160) / state.camera.z),
      ),
      maxHeight: Math.max(
        60,
        Math.min(360, (canvas.clientHeight - 180) / state.camera.z),
      ),
    };
  }
  const current = (target) =>
    active() &&
    state.project.id === target.project &&
    board().id === target.board;
  async function add(files, target) {
    if (!target || !files.length) return;
    if (uploading)
      return toast("Wait for the current images to finish uploading.");
    uploading = true;
    const nodes = [],
      errors = [];
    toast(
      files.length === 1 ? "Adding image…" : `Adding ${files.length} images…`,
    );
    try {
      for (const file of files) {
        if (!current(target))
          throw new Error(
            "Image import stopped because you left the board. Open it and try again.",
          );
        try {
          const image = await readImage(file);
          if (!current(target))
            throw new Error("The board changed during upload.");
          const attachment = await api(target.url, {
            method: "POST",
            body: { name: file.name, data: image.data },
          });
          const scale = Math.min(
            target.maxWidth / image.width,
            target.maxHeight / image.height,
          );
          const w = Math.max(1, Math.round(image.width * scale)),
            h = Math.max(1, Math.round(image.height * scale)) + 26;
          nodes.push({
            id: uid("n"),
            type: "image",
            src: attachment.path,
            text: file.name,
            x: target.position.x - w / 2 + nodes.length * 24,
            y: target.position.y - h / 2 + nodes.length * 24,
            w,
            h,
          });
        } catch (error) {
          errors.push(`${file.name}: ${error.message}`);
        }
      }
      if (!current(target))
        throw new Error(
          "Image import stopped because you left the board. Open it and try again.",
        );
      if (nodes.length) {
        if (!finishEditing())
          throw new Error(
            "Finish editing the current object before adding images.",
          );
        state.tool = "cursor";
        changeBoard((b) => b.nodes.push(...nodes));
        select(nodes);
      }
      if (errors.length) toast(errors.join("\n"), true);
      else
        toast(
          nodes.length === 1 ? "Image added." : `${nodes.length} images added.`,
        );
    } catch (error) {
      toast(error.message, true);
    } finally {
      uploading = false;
    }
  }
  function choose() {
    if (uploading)
      return toast("Wait for the current images to finish uploading.");
    const target = destination();
    if (!target) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = boardImageAccept;
    input.multiple = true;
    input.onchange = () => add([...input.files], target);
    input.click();
  }
  const fileDrag = (event) =>
    [...(event.dataTransfer?.types || [])].includes("Files");
  const dropCanvas = (event) =>
    active() &&
    event.target.closest("#canvas") &&
    !event.target.closest(
      ".board-tools,.canvas-panel,.board-controls,.inline-floating-tools,#selection-tools",
    );
  const clearDrop = () => $("#canvas")?.classList.remove("image-drop-active");
  document.addEventListener("dragover", (event) => {
    if (!fileDrag(event) || !active() || !event.target.closest("#canvas"))
      return;
    event.preventDefault();
    if (!dropCanvas(event)) {
      event.dataTransfer.dropEffect = "none";
      clearDrop();
      return;
    }
    event.dataTransfer.dropEffect = "copy";
    $("#canvas").classList.add("image-drop-active");
  });
  document.addEventListener("dragleave", (event) => {
    if (
      event.target === $("#canvas") ||
      !$("#canvas")?.contains(event.relatedTarget)
    )
      clearDrop();
  });
  document.addEventListener("dragend", clearDrop);
  document.addEventListener(
    "drop",
    (event) => {
      clearDrop();
      if (!fileDrag(event) || !active() || !event.target.closest("#canvas"))
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!dropCanvas(event)) return;
      add([...event.dataTransfer.files], destination(point(event)));
    },
    true,
  );
  return { choose };
}
