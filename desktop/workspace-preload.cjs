// Only unhandled, real zoom gestures cross this private bridge. The remote page gets no API.
// Listen after document handlers so a board can keep its own canvas zoom shortcuts.
const { ipcRenderer } = require('electron');
window.addEventListener('keydown', event => {
  if (!event.isTrusted || event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
  const action = ['+', '='].includes(event.key) ? 'in' : event.key === '-' ? 'out' : event.key === '0' ? 'reset' : null;
  if (!action) return;
  event.preventDefault();
  ipcRenderer.send('pencils:zoom', action);
});

// A small threshold keeps high-resolution wheels and trackpad pinches from racing to a limit.
let wheelAmount = 0, lastWheel = 0;
window.addEventListener('wheel', event => {
  if (!event.isTrusted || event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey) || !event.deltaY) return;
  event.preventDefault();
  const now = performance.now(), delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
  if (now - lastWheel > 200 || Math.sign(delta) !== Math.sign(wheelAmount)) wheelAmount = 0;
  lastWheel = now; wheelAmount += delta;
  if (Math.abs(wheelAmount) >= 40) {
    ipcRenderer.send('pencils:zoom', wheelAmount < 0 ? 'in' : 'out');
    wheelAmount = 0;
  }
}, { passive: false });
