const api = window.pencilsConnection;
const form = document.querySelector('#connection-form'), address = document.querySelector('#server');
const button = document.querySelector('#connect'), cancel = document.querySelector('#cancel'), status = document.querySelector('#connection-status');
async function connect() {
  button.disabled = true; cancel.disabled = true; address.readOnly = true;
  button.textContent = 'Connecting…'; status.textContent = 'Opening your workspace…'; status.removeAttribute('data-error');
  try {
    const result = await api.connect(address.value);
    if (!result.ok) throw new Error(result.error);
    status.textContent = 'Connected.';
  } catch (error) {
    status.textContent = error.message || 'Could not connect. Please try again.';
    status.setAttribute('data-error', ''); button.textContent = 'Connect';
    button.disabled = false; cancel.disabled = false; address.readOnly = false; address.focus();
  }
}
form.addEventListener('submit', event => { event.preventDefault(); if (!button.disabled) void connect(); });
cancel.addEventListener('click', () => api.cancel());
api.state().then(state => {
  address.value = state.server;
  document.querySelector('#desktop-version').textContent = `Desktop ${state.version}`;
  cancel.hidden = !state.connected;
  status.textContent = state.error;
  status.toggleAttribute('data-error', !!state.error);
  if (state.automatic) void connect();
  else address.focus();
}).catch(() => { status.textContent = 'The connection window could not start. Close Pencils and reopen it.'; });
