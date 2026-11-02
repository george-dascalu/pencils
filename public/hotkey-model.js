// Ctrl on Windows/Linux and Command on macOS share a binding.
export function hotkeyChord(event) {
  if (event.isComposing || event.getModifierState?.('AltGraph') || (!event.ctrlKey && !event.metaKey)) return '';
  // Option can turn a letter into a symbol on macOS; the physical key stays stable.
  const key = event.altKey && /^(Key[A-Z]|Digit[0-9])$/.test(event.code) ? event.code.replace(/^(Key|Digit)/, '') : event.key;
  if (!/^[a-z0-9]$/i.test(key)) return '';
  return ['Mod', event.altKey && 'Alt', event.shiftKey && 'Shift', key.toUpperCase()].filter(Boolean).join('+');
}
export function hotkeyIssue(chord) {
  if (typeof chord !== 'string' || !/^Mod\+(Alt\+)?(Shift\+)?[A-Z0-9]$/.test(chord)) return 'Use Ctrl or Cmd with a letter or number; add Alt or Shift if needed.';
  const key = chord.at(-1);
  // Browser navigation, editing and app-wide Search keep their existing shortcuts.
  if (!chord.includes('+Alt+') && ('ABCDFGIJKLNOPQRSTUVWXYZ0123456789'.includes(key))) return 'This shortcut is reserved by the browser or editor. Try adding Alt.';
  return '';
}
export const hotkeyTarget = item => item.type === 'command' ? `command:${item.id}` : `${item.kind}:${item.project}:${item.id}`;
