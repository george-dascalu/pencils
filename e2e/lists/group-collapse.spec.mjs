import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp();
const group = (page, field, value) => page.locator(`#view-content section[data-task-drop-field="${field}"][data-task-drop-value="${value}"]`);
const toggle = section => section.locator('[data-list-group-toggle]');
const rows = section => section.locator('[data-task-order-row]');
async function seed() {
  const project = await app.store.createProject({ title: 'Collapsible groups' });
  const a = await app.store.createTask(project.id, { title: 'First open card', status: 'todo', assignee: 'todo', tags: ['todo', 'other'] });
  const b = await app.store.createTask(project.id, { title: 'Second open card', status: 'todo' });
  const c = await app.store.createTask(project.id, { title: 'Finished card', status: 'done' });
  return { project, a, b, c };
}
async function open(page, project) {
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await expect(group(page, 'status', 'todo')).toBeVisible();
}
async function grouping(page, field) {
  const control = await reveal(page.locator('#group-by'));
  await control.selectOption(field);
  await page.keyboard.press('Escape');
}

onDevices(['desktop', 'phone'], () => test('groups collapse by pointer or keyboard and stay collapsed across reloads and navigation @gate', async ({ page, device }) => {
  const { project } = await seed(); await open(page, project);
  const todo = group(page, 'status', 'todo'), button = toggle(todo);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const size = await button.boundingBox();
  expect(size.width).toBe(size.height);
  expect(size.height).toBe(device === 'phone' ? 44 : 32);
  const before = (await app.store.snapshot(project.id)).tasks;
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(rows(todo).first()).toBeHidden();
  await expect(todo.locator('.count')).toHaveText('2');
  await expect(group(page, 'status', 'done').locator('.task-row')).toBeVisible();
  expect(await button.locator('.icon').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).b)).toBeCloseTo(-1);
  await page.reload();
  await expect(toggle(todo)).toHaveAttribute('aria-expanded', 'false');
  await expect(rows(todo).first()).toBeHidden();
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await expect(toggle(todo)).toHaveAttribute('aria-expanded', 'false');
  await button.focus(); await page.keyboard.press('Enter');
  await expect(rows(todo).first()).toBeVisible();
  await expect(button).toBeFocused();
  await page.keyboard.press('Space');
  await expect(rows(todo).first()).toBeHidden();
  await page.keyboard.press('Enter');
  await page.reload();
  await expect(rows(todo).first()).toBeVisible();
  expect((await app.store.snapshot(project.id)).tasks).toEqual(before);
}));

test('collapse choices are separate by project and grouping, including tags, empty values and filtered redraws @gate', async ({ page }) => {
  const { project } = await seed(); await open(page, project);
  await toggle(group(page, 'status', 'todo')).click();
  await page.locator('#search').fill('Finished');
  await expect(group(page, 'status', 'todo')).toBeHidden();
  await page.locator('#search').fill('');
  await expect(rows(group(page, 'status', 'todo')).first()).toBeHidden();
  await grouping(page, 'tags');
  const tagged = group(page, 'tags', 'todo'), empty = group(page, 'tags', '');
  await expect(rows(tagged)).toBeVisible();
  await toggle(tagged).click(); await toggle(empty).click();
  await expect(rows(group(page, 'tags', 'other'))).toBeVisible();
  await grouping(page, 'assignee');
  await expect(rows(group(page, 'assignee', 'todo'))).toBeVisible();
  await grouping(page, 'none');
  await expect(page.locator('[data-list-group-toggle]')).toHaveCount(0);
  await grouping(page, 'tags');
  await expect(rows(tagged)).toBeHidden(); await expect(rows(empty).first()).toBeHidden();
  await page.reload();
  await expect(toggle(empty)).toHaveAttribute('aria-expanded', 'false');
  const other = await seed(); await open(page, other.project);
  await expect(rows(group(page, 'status', 'todo')).first()).toBeVisible();
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await expect(rows(group(page, 'tags', 'todo'))).toBeHidden();
});

test('collapsed groups can be reordered and receive a dropped card without expanding @gate', async ({ page }) => {
  const { project, a } = await seed(); await open(page, project);
  const done = group(page, 'status', 'done');
  await toggle(done).click();
  // Keyboard card reordering skips rows in a collapsed group.
  const lastOpen = group(page, 'status', 'todo').locator('[data-task-reorder]').last();
  await lastOpen.focus(); await page.keyboard.press('Alt+ArrowDown');
  await expect(lastOpen).toBeFocused();
  const grip = done.locator('[data-group-reorder]');
  await grip.focus(); await page.keyboard.press('Alt+ArrowUp');
  await expect(toggle(done)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.list-group').first()).toHaveAttribute('data-task-drop-value', 'done');
  const source = page.locator(`[data-task-reorder="${a.id}"]`), r = await source.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + 12);
  const head = await done.locator('.section-title').boundingBox();
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2, { steps: 8 });
  await expect(done).toHaveClass(/task-group-drop-target/);
  const marker = await page.locator('.task-reorder-marker').boundingBox();
  expect(marker.y).toBeCloseTo(head.y + head.height, 0);
  await page.mouse.up();
  await expect.poll(async () => (await app.store.snapshot(project.id)).tasks.find(t => t.id === a.id).status).toBe('done');
  await expect(rows(done).first()).toBeHidden();
  await expect(toggle(done)).toBeFocused();
  await page.reload();
  await expect(rows(done).first()).toBeHidden();
  await toggle(done).click();
  await expect(done.locator(`[data-task-order-row="${a.id}"]`)).toBeVisible();
});
