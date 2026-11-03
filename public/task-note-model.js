// Card notes are portable Markdown, including attachment links, kept with the card.
export const TASK_NOTE_LIMIT = 200;
export const TASK_NOTE_CHARACTERS = 200000;
export function validTaskNotes(value) {
  if (value == null) return true;
  if (!Array.isArray(value) || value.length > TASK_NOTE_LIMIT) return false;
  const ids = new Set(); let characters = 0;
  for (const note of value) {
    if (!note || typeof note !== 'object' || Array.isArray(note) ||
        typeof note.id !== 'string' || !/^n-[a-zA-Z0-9_-]{1,78}$/.test(note.id) || ids.has(note.id) ||
        typeof note.body !== 'string' || note.body.length > TASK_NOTE_CHARACTERS) return false;
    ids.add(note.id); characters += note.body.length;
    if (characters > 1000000) return false;
  }
  return true;
}
