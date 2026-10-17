import {test} from 'node:test';import assert from 'node:assert/strict';import {routeEdge} from '../public/canvas-geometry.js';
test('elbow arrows avoid intervening cards and keep deterministic label anchors',()=>{
 const a={id:'a',type:'task',x:0,y:0,w:100,h:100},b={id:'b',type:'task',x:500,y:0,w:100,h:100},obstacle={id:'c',type:'task',x:200,y:-50,w:150,h:200};const edge={from:'a',to:'b',fromSide:'right',toSide:'left',routing:'elbow'};
 const route=routeEdge(edge,a,b,[a,b,obstacle]);assert.ok(route.points.length>2);assert.deepEqual(route,routeEdge(edge,a,b,[a,b,obstacle]));
 for(let i=1;i<route.points.length;i++){const p=route.points[i-1],q=route.points[i];assert.ok(p.x===q.x||p.y===q.y);const mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};assert.ok(!(mid.x>obstacle.x&&mid.x<obstacle.x+obstacle.w&&mid.y>obstacle.y&&mid.y<obstacle.y+obstacle.h));}
 assert.equal(route.p.x,100);assert.equal(route.q.x,500);
});
