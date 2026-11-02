import { PersonalLists, VIEWS, own } from './bookmarks.js';
import { Problem } from './problem.js';
import { hotkeyIssue, hotkeyTarget } from '../public/hotkey-model.js';

export class Hotkeys extends PersonalLists {
  constructor(store, bookmarks) { super(store, 'hotkeys.json'); this.bookmarks = bookmarks; }
  async resolve(user, binding) {
    if (binding.type === 'command') return binding;
    const item = await this.bookmarks.resolve(user, binding);
    return item && { ...item, type: 'item', chord: binding.chord };
  }
  async list(user) {
    return (await Promise.all(own(await this.all(), user.username).map(b => this.resolve(user, b)))).filter(Boolean);
  }
  async replace(user, input) {
    if (!Array.isArray(input?.items)) throw new Problem(400, 'Send hotkeys as a list.');
    const items = [], chords = new Set(), targets = new Set();
    for (const b of input.items) {
      if (!b || typeof b.id !== 'string' || (b.type === 'command' ? !/^[a-z][a-z0-9-]{0,39}$/.test(b.id) : b.type !== 'item' || !['card', 'doc', 'board', 'view'].includes(b.kind) || typeof b.project !== 'string' || (b.kind === 'view' && !VIEWS.includes(b.id)))) throw new Problem(400, 'Choose a command or a bookmarked card, document, board or view.');
      const issue = hotkeyIssue(b.chord);
      if (issue) throw new Problem(400, issue);
      if (chords.has(b.chord) || targets.has(hotkeyTarget(b))) throw new Problem(400, 'Each shortcut and each action can only be assigned once.');
      const binding = b.type === 'command' ? { type: b.type, id: b.id, chord: b.chord } : { type: b.type, kind: b.kind, project: b.project, id: b.id, chord: b.chord };
      if (!(await this.resolve(user, binding))) throw new Problem(404, 'Not found.');
      chords.add(b.chord); targets.add(hotkeyTarget(b)); items.push(binding);
    }
    return this.serial(async () => {
      await this.save({ ...(await this.all()), [user.username]: items });
      return { ok: true };
    });
  }
}
