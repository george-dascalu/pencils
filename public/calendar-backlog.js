// The Week board's Unscheduled row (F0.22-53): a grid as wide as the days shown, one card to a
// place. A card keeps the place saved in it (`backlog: { col, row }`) while that place is free and
// shown; the others take the place of their turn in the order given, row by row, or the next free
// one, so moving a card doesn't shift the rest.
const key = ({ col, row }) => `${col},${row}`;
const fits = (place, columns) => Number.isInteger(place?.col) && Number.isInteger(place?.row) && place.col >= 0 && place.row >= 0 && place.col < columns;
// Hands out the free places in order; places only get taken, so the search never goes back.
function freePlaces(taken, columns) {
  let i = 0;
  const slot = () => ({ col: i % columns, row: Math.floor(i / columns) });
  return () => {
    while (taken.has(key(slot()))) i++;
    const place = slot();
    taken.add(key(place));
    return place;
  };
}

export function backlogLayout(cards, columns) {
  const places = new Map(), taken = new Set();
  for (const card of cards)
    if (fits(card.backlog, columns) && !taken.has(key(card.backlog))) {
      places.set(card.id, { col: card.backlog.col, row: card.backlog.row });
      taken.add(key(card.backlog));
    }
  // The places from a card's turn up to the one it takes are all taken, so the next card's search
  // starts after it.
  let i = 0;
  cards.forEach((card, turn) => {
    if (places.has(card.id)) return;
    i = Math.max(i, turn);
    while (taken.has(`${i % columns},${Math.floor(i / columns)}`)) i++;
    places.set(card.id, { col: i % columns, row: Math.floor(i / columns) });
    taken.add(`${i % columns},${Math.floor(i / columns)}`);
    i++;
  });
  // One spare row below the last card to drop into.
  const last = [...places.values()].reduce((row, place) => Math.max(row, place.row), -1);
  return { places, rows: last + 2 };
}

// The saves that move card `id` to `target` among `cards` (each with its saved place, if any): a card
// already there takes the moving card's place, or the first free one when the moving card comes
// from a day, and cards the move would shift are saved where they are, so nothing else moves.
export function backlogMove(cards, columns, id, target) {
  const list = cards.some((card) => card.id === id) ? cards : [...cards, { id }];
  const before = backlogLayout(cards, columns).places, from = before.get(id);
  if (from && key(from) === key(target)) return [];
  const saved = new Map([[id, { col: target.col, row: target.row }]]);
  const other = [...before].find(([card, place]) => card !== id && key(place) === key(target))?.[0];
  if (other) {
    const taken = new Set([...before].filter(([card]) => card !== id && card !== other).map(([, place]) => key(place)).concat(key(target)));
    saved.set(other, from ? { ...from } : freePlaces(taken, columns)());
  }
  // Each pass saves at least one more card at its place, so this ends.
  for (;;) {
    const after = backlogLayout(list.map((card) => (saved.has(card.id) ? { ...card, backlog: saved.get(card.id) } : card)), columns).places;
    // A card with a saved place keeps it, even one under a hidden weekend that shows again later.
    const shifted = [...before].filter(([card, place]) => !saved.has(card) && list.find((c) => c.id === card)?.backlog == null && key(after.get(card)) !== key(place));
    if (!shifted.length) break;
    for (const [card, place] of shifted) saved.set(card, { ...place });
  }
  return [...saved].map(([card, backlog]) => ({ id: card, backlog }));
}
