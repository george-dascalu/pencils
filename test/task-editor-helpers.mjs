export async function legacySubtasks(form, children) {
  await form.locator("[name=pendingSubtasks]").evaluate((input, children) => {
    input.value = JSON.stringify(children);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, children);
}
