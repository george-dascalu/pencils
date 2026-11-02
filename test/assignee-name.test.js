import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitAssigneeName} from '../public/assignee-name.js';
test('assignee names prefer the full name, then configured short name, then one character',()=>{
  const measure=s=>Array.from(s).length*10;
  assert.equal(fitAssigneeName('George','Geo',60,measure),'George');
  assert.equal(fitAssigneeName('George','Geo',59,measure),'Geo');
  assert.equal(fitAssigneeName('George','GD',25,measure),'GD');
  assert.equal(fitAssigneeName('George','Geo',20,measure),'G');
  assert.equal(fitAssigneeName('Li','Li',20,measure),'Li');
  assert.equal(fitAssigneeName('Élodie','Élo',10,measure),'É');
});
