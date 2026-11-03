import {Problem} from './problem.js';

export function validTaskBoards(value) {
  return value == null || Array.isArray(value) && value.length <= 200 &&
    value.every(id => typeof id === 'string' && /^b-[a-zA-Z0-9_-]+$/.test(id)) &&
    new Set(value).size === value.length;
}

export async function validateTaskBoards(store, project, boards, previous = []) {
  // Existing links survive deletion so unrelated card edits and unlinking work.
  for (const id of boards || []) {
    if (previous?.includes(id)) continue;
    try { await store.read(store.file(project, 'boards', id)); }
    catch (error) {
      if (error.status !== 404) throw error;
      throw new Problem(400, 'Choose a board from this project.');
    }
  }
}
