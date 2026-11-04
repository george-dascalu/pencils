// The cards followed from inside the card editor, so Back can return to each one (F0.21-98).
let trail = [];
export const cardTrail = {
  push: (id) => trail.push(id),
  pop: () => trail.pop(),
  peek: () => trail[trail.length - 1],
  clear: () => { trail = []; },
};
