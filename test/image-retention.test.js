import test from 'node:test';
import assert from 'node:assert/strict';
import { imageRetentionPlan, pruneReleaseImages } from '../scripts/deploy.mjs';

const id = n => `sha256:${n.toString(16).padStart(64, '0')}`;
const image = (tag, n, repository = 'pencils') => ({ Repository: repository, Tag: tag, ID: id(n) });
const inventory = [image('local', 5), image('release-0.22.1', 5), image('rollback-before-0.22.1', 4), image('release-0.22.0', 4), image('release-0.21.99', 3), image('release-0.21.98', 2), image('rollback-before-0.21.99', 2), image('0.15.9', 1), image('rollback-before-header', 1), image('task-scope-0.16.6', 1)];

test('retention keeps three distinct Pencils release images, including live and rollback, across minor cycles', () => {
  const plan = imageRetentionPlan(inventory, { live: id(5), rollback: id(4) });
  assert.deepEqual(plan.keep, [id(5), id(4), id(3)]);
  assert.deepEqual(plan.remove.sort(), ['pencils:release-0.21.98', 'pencils:rollback-before-0.21.99', 'pencils:0.15.9', 'pencils:rollback-before-header', 'pencils:task-scope-0.16.6'].sort());
  assert.deepEqual(plan.skipped, []);
  assert.equal(inventory.length, 10, 'planning does not modify its input');
});

test('aliases count as one image, foreign repositories stay untouched, and fewer than three images stay', () => {
  const rows = [image('local', 4), image('release-0.21.4', 4), image('0.21.4', 4), image('release-0.21.3', 3), image('0.21.2', 2), image('latest', 1, 'other-app')];
  assert.deepEqual(imageRetentionPlan(rows, { live: id(4), rollback: id(3) }).keep, [id(4), id(3), id(2)]);
  assert.deepEqual(imageRetentionPlan(rows, { live: id(4), rollback: id(3) }).remove, []);
  assert.deepEqual(imageRetentionPlan(rows.slice(0, 3), { live: id(4), rollback: id(4) }).keep, [id(4)]);
});

test('a deployment after a rollback protects its exact previous image, even if later versions exist', () => {
  const plan = imageRetentionPlan(inventory, { live: id(5), rollback: id(1) });
  assert.deepEqual(plan.keep, [id(5), id(1), id(4)]);
  assert.ok(!plan.remove.includes('pencils:0.15.9'));
  assert.ok(plan.remove.includes('pencils:release-0.21.99'));
});

test('release ordering comes from numeric versions, independent of Docker row order', () => {
  const rows=[image('release-0.21.9',1),image('release-0.21.10',2),image('release-0.22.0',3),image('release-1.0.0',4),image('local',5),image('release-1.0.1',5)];
  for (const inventory of [rows,[...rows].reverse()]) {
    const plan=imageRetentionPlan(inventory,{live:id(5),rollback:id(1)});
    assert.deepEqual(plan.keep,[id(5),id(1),id(4)]);
  }
});

test('in-use old images are skipped rather than deleting another container image', () => {
  const plan = imageRetentionPlan(inventory, { live: id(5), rollback: id(4), inUse: [id(1)] });
  assert.deepEqual(plan.skipped, [id(1)]);
  assert.ok(plan.remove.every(ref => !['pencils:0.15.9', 'pencils:rollback-before-header', 'pencils:task-scope-0.16.6'].includes(ref)));
});

test('missing protected images and malformed Docker inventory fail closed', () => {
  for (const options of [{live:id(8),rollback:id(4)}, {live:id(5),rollback:id(8)}, {live:'bad',rollback:id(4)}])
    assert.throws(() => imageRetentionPlan(inventory, options), /image|inventory/i);
  for (const bad of [image('--force', 1), {...image('old',1),ID:'invalid'}, {...image('old',1),Tag:'invalid/tag'}])
    assert.throws(() => imageRetentionPlan([...inventory,bad], {live:id(5),rollback:id(4)}), /inventory/i);
});

function dockerStub(rows = inventory, { inUse = [], removeError = false, live = id(5) } = {}) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, args]); assert.equal(cmd, 'docker');
    if (args[0] === 'compose') return 'current-container\n';
    if (args[0] === 'container' && args[1] === 'inspect') return `${[live, ...(args.includes('other-container') ? inUse : [])].join('\n')}\n`;
    if (args[0] === 'container') return 'current-container\nother-container\n';
    if (args[0] === 'image' && args[1] === 'inspect') return `${id(4)}\n`;
    if (args[0] === 'image' && args[1] === 'ls') return rows.map(row=>JSON.stringify(row)).join('\n');
    if (args[0] === 'image' && args[1] === 'rm') { if (removeError) throw new Error('image in use'); return ''; }
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  };
  return { run, calls };
}
const options = { version: '0.22.1', health: { ok: true, version: '0.22.1' } };

test('cleanup verifies health first and removes only planned references, in bounded non-forced batches', async () => {
  const rows=[...inventory,...Array.from({length:120},(_,i)=>image(`release-0.14.${i}`,100+i))];
  const {run,calls}=dockerStub(rows);
  const result=await pruneReleaseImages(run,options);
  const deletes=calls.filter(([,args])=>args[1]==='rm');
  assert.equal(result.removed,125);
  assert.equal(deletes.length,3);
  for (const [,args] of deletes) {
    assert.deepEqual(args.slice(0,3),['image','rm','--no-prune']);
    assert.ok(args.length<=53);
    assert.ok(args.slice(3).every(ref=>ref.startsWith('pencils:')));
    assert.ok(!args.includes('--force'));
  }
  assert.deepEqual(result.skipped,[]);
  assert.deepEqual(result.errors,[]);
});

test('unhealthy or mismatched releases do not even inspect or remove images', async () => {
  for (const health of [{ok:false,version:'0.22.1'},{ok:true,version:'0.22.0'},null]) {
    const {run,calls}=dockerStub();
    await assert.rejects(pruneReleaseImages(run,{...options,health}),/healthy/i);
    assert.deepEqual(calls,[]);
  }
});

test('a missing or replaced live release tag stops cleanup before deletions', async () => {
  for (const rows of [inventory.filter(row=>row.Tag!=='release-0.22.1'),inventory.map(row=>row.Tag==='release-0.22.1'?{...row,ID:id(7)}:row)]) {
    const {run,calls}=dockerStub(rows);
    await assert.rejects(pruneReleaseImages(run,options),/live|release/i);
    assert.equal(calls.filter(([,args])=>args[1]==='rm').length,0);
  }
});

test('a missing live container stops cleanup before any image command', async () => {
  const calls=[];
  await assert.rejects(pruneReleaseImages(async(cmd,args)=>{calls.push([cmd,args]);return '';},options),/live.*container/i);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0][1],['compose','ps','-q','pencils']);
});

test('cleanup sends no empty removal batch when nothing is old or a batch is exactly full', async () => {
  for (const count of [0,50]) {
    const rows=[...inventory.filter(row=>[id(5),id(4),id(3)].includes(row.ID)),...Array.from({length:count},(_,i)=>image(`release-0.14.${i}`,100+i))];
    const {run,calls}=dockerStub(rows);
    const result=await pruneReleaseImages(run,options);
    assert.equal(result.removed,count);
    assert.deepEqual(result.errors,[]);
    assert.equal(calls.filter(([,args])=>args[1]==='rm').length,count/50);
  }
});

test('cleanup protects images held by other containers and reports Docker refusals without forcing', async () => {
  const {run}=dockerStub(inventory,{inUse:[id(1)],removeError:true});
  const result=await pruneReleaseImages(run,options);
  assert.deepEqual(result.skipped,[id(1)]);
  assert.equal(result.removed,0);
  assert.equal(result.errors.length,1);
  assert.match(result.errors[0],/image in use/);
});
