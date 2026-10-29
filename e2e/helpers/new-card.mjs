// The header New control is a menu offering a card or a document (PEN-6).
// Tests that need the card editor open it through the menu.
export async function newCard(page, { tap = false } = {}) {
  const summary = page.locator(".topbar .new-menu:not(.phone-new-task) > summary:visible, .topbar .phone-new-task > summary:visible").first();
  await (tap ? summary.tap() : summary.click());
  const item = page.locator('.topbar .new-menu-panel:visible [data-action="task-new"]').first();
  await (tap ? item.tap() : item.click());
}
