// Minimal image PDF writer. Everything is rasterised locally; no remote service.
export async function framesPDF(frames, render) {
  const encoder = new TextEncoder(),
    chunks = [],
    offsets = [0];
  let length = 0;
  const append = (value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    append(`${id} 0 obj\n`);
    append(body);
    append("\nendobj\n");
  };
  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(
    2,
    `<< /Type /Pages /Count ${frames.length} /Kids [${frames.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`,
  );
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i],
      result = await render(f),
      url = URL.createObjectURL(
        new Blob([result.text], { type: "image/svg+xml" }),
      );
    let bytes, width, height;
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas"),
        scale = Math.min(2, 4096 / f.w, 4096 / f.h);
      canvas.width = width = Math.ceil(f.w * scale);
      canvas.height = height = Math.ceil(f.h * scale);
      const c = canvas.getContext("2d");
      c.fillStyle = "#fff";
      c.fillRect(0, 0, width, height);
      c.drawImage(image, 0, 0, width, height);
      bytes = Uint8Array.from(
        atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]),
        (c) => c.charCodeAt(0),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
    const id = 3 + i * 3,
      w = Math.min(14400, f.w),
      h = Math.min(14400, f.h),
      commands = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    object(
      id + 1,
      `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`,
    );
    offsets[id + 2] = length;
    append(
      `${id + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
    );
    append(bytes);
    append("\nendstream\nendobj\n");
  }
  const start = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1))
    append(`${String(offset).padStart(10, "0")} 00000 n \n`);
  append(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`,
  );
  return new Blob(chunks, { type: "application/pdf" });
}
export function frameThumbnail(frame, nodes, esc) {
  return `<svg class="frame-thumbnail" viewBox="${frame.x} ${frame.y} ${frame.w} ${frame.h}" aria-hidden="true"><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="${esc(frame.color || "#f5f5ef")}"/>${nodes
    .filter(
      (n) =>
        n.id !== frame.id &&
        n.x < frame.x + frame.w &&
        n.y < frame.y + frame.h &&
        n.x + n.w > frame.x &&
        n.y + n.h > frame.y,
    )
    .slice(0, 200)
    .map(
      (n) =>
        `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${esc(/^#[a-f0-9]{6}$/i.test(n.color || "") ? n.color : "#c4d1bf")}" stroke="#809078" stroke-width="2"/>`,
    )
    .join("")}</svg>`;
}
