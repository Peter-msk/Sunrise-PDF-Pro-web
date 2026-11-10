import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,estimateRemaining} from '../src/conversion-clock.js';
test('R61 duration formatter uses stable elapsed clock units',()=>{
 assert.equal(formatDuration(0),'00:00');
 assert.equal(formatDuration(61700),'01:01');
 assert.equal(formatDuration(3661000),'1:01:01');
 assert.equal(formatDuration(-1),'—');
 assert.equal(formatDuration(Number.NaN),'—');
});
test('R61 ETA is withheld until it is grounded and stays bounded',()=>{
 assert.equal(estimateRemaining(5000,.5),null);
 assert.equal(estimateRemaining(30000,.05),null);
 assert.equal(estimateRemaining(30000,.5,20001),null);
 assert.equal(estimateRemaining(30000,1),null);
 assert.equal(estimateRemaining(30000,.5),30000);
 assert.equal(estimateRemaining(999999999,.07),86400000);
});
