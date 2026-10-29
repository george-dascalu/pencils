// Comments on document text. A thread's first comment keeps an anchor: the quoted text with a few
// words either side, so the Markdown itself never changes and the quote is found again after edits.
const CONTEXT = 32;

export function makeAnchor(body, from, to) {
  to = Math.min(to, from + 500);
  return { quote: body.slice(from, to), prefix: body.slice(Math.max(0, from - CONTEXT), from), suffix: body.slice(to, to + CONTEXT) };
}

// Where the quote is now: of its occurrences, the one whose surroundings match best; null if gone.
export function locateAnchor(body, { quote, prefix = "", suffix = "" } = {}) {
  if (!quote) return null;
  const common = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };
  const reverse = (text) => [...text].reverse().join("");
  let best = null;
  for (let at = body.indexOf(quote); at >= 0; at = body.indexOf(quote, at + 1)) {
    const score = common(reverse(body.slice(Math.max(0, at - prefix.length), at)), reverse(prefix)) + common(body.slice(at + quote.length, at + quote.length + suffix.length), suffix);
    if (!best || score > best.score) best = { from: at, to: at + quote.length, score };
  }
  return best && { from: best.from, to: best.to };
}

// What the server accepts (server/services/documents.js). A list holding anything else, such as an
// empty item left by an edit in Obsidian, is shown without threads and not written to.
const short = (value, max) => typeof value === "string" && value.length <= max;
export const validComment = (c) =>
  !!c && typeof c === "object" && !!c.id && short(c.id, 200) && short(c.text, 20000) && short(c.author, 100) &&
  (c.anchor === undefined || (!!c.anchor && typeof c.anchor === "object" && !!c.anchor.quote && short(c.anchor.quote, 500) && (c.anchor.prefix === undefined || short(c.anchor.prefix, 64)) && (c.anchor.suffix === undefined || short(c.anchor.suffix, 64))));

// Each comment's thread, as the ID of its first comment (replies point at what they answer).
export function threadRoots(comments) {
  const byId = new Map(comments.map((c) => [c.id, c])), roots = new Map();
  const rootOf = (c, seen) => {
    if (!roots.has(c.id)) {
      seen.add(c.id);
      const parent = byId.get(c.replyTo);
      roots.set(c.id, parent && !seen.has(parent.id) ? rootOf(parent, seen) : c.id);
    }
    return roots.get(c.id);
  };
  for (const c of comments) rootOf(c, new Set());
  return roots;
}

// Each anchored thread with where its quote is now (null when detached) and all its comments.
export function documentThreads(body, comments = []) {
  const roots = threadRoots(comments), threads = new Map();
  for (const c of comments) if (c.anchor && !c.replyTo) threads.set(c.id, { id: c.id, root: c, range: locateAnchor(body, c.anchor), comments: [] });
  for (const c of comments) threads.get(roots.get(c.id))?.comments.push(c);
  return [...threads.values()];
}
