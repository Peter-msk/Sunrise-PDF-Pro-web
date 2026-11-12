import test from 'node:test';
import assert from 'node:assert/strict';
import {createSvgVectorBudget,SVG_VECTOR_BUDGET} from '../src/svg-vector-budget.mjs';
const path=d=>({localName:'path',getAttribute:key=>key==='d'?d:null});
const poly=(type,points)=>({localName:type,getAttribute:key=>key==='points'?points:null});
const text=()=>({localName:'text',getAttribute:()=>null});

test('normal HWP paths and SVG text remain eligible',()=>{
  const v=createSvgVectorBudget();
  assert.equal(v.element(path('M0 0 L10 20 C1 2 3 4 5 6 Z')),null);
  assert.equal(v.element(poly('polygon','0,0 20,0 20,20')),null);
  assert.equal(v.text('환경영향평가 내용 · 표 A/B'),null);
  assert.deepEqual(v.totals,{pathChars:26,commands:4,pointsChars:14,textChars:17});
});
test('path command counter does not confuse numeric exponent with command',()=>{
  const v=createSvgVectorBudget();
  assert.equal(v.element(path('M1e-5 2E5 l1.2e-3 4.5')),null);
  assert.equal(v.totals.commands,2);
});
test('large single path is rejected before synchronous PDFKit',()=>{
  const v=createSvgVectorBudget();
  assert.equal(v.element(path('M'+ '0'.repeat(SVG_VECTOR_BUDGET.pathSingle))), 'SVG_VECTOR_PATH_BUDGET');
});
test('path length exact limit allowed, next char denied',()=>{
  const v=createSvgVectorBudget({ ...SVG_VECTOR_BUDGET,pathSingle:10,pathTotal:100 });
  assert.equal(v.element(path('M'+ '0'.repeat(9))),null);
  assert.equal(v.element(path('M'+ '0'.repeat(10))),'SVG_VECTOR_PATH_BUDGET');
});
test('path sum is bounded even when individual paths fit',()=>{
  const v=createSvgVectorBudget({...SVG_VECTOR_BUDGET,pathSingle:10,pathTotal:14});
  assert.equal(v.element(path('M0 1 2 3')),null);
  assert.equal(v.element(path('M1 2 3 4')),'SVG_VECTOR_PATH_BUDGET');
});
test('path command budget guards many tiny operations',()=>{
  const v=createSvgVectorBudget({...SVG_VECTOR_BUDGET,commandsSingle:3,commandsTotal:5});
  assert.equal(v.element(path('M0L1L2L3')),'SVG_VECTOR_COMMAND_BUDGET');
});
test('aggregate path commands guard many small paths',()=>{
  const v=createSvgVectorBudget({...SVG_VECTOR_BUDGET,commandsSingle:10,commandsTotal:3});
  assert.equal(v.element(path('M0L1')),null);
  assert.equal(v.element(path('M1L2')),'SVG_VECTOR_COMMAND_BUDGET');
});
test('complex polyline limit applies',()=>{
  const v=createSvgVectorBudget({...SVG_VECTOR_BUDGET,pointsSingle:5});
  assert.equal(v.element(poly('polyline','0 0 1 2')),'SVG_VECTOR_POINTS_BUDGET');
});
test('polygons and polylines share aggregate point budget',()=>{
  const v=createSvgVectorBudget({...SVG_VECTOR_BUDGET,pointsSingle:100,pointsTotal:8});
  assert.equal(v.element(poly('polygon','0 0 1')),null);
  assert.equal(v.element(poly('polyline','2 2 3')),'SVG_VECTOR_POINTS_BUDGET');
});
test('one long text run is rejected before font lookup',()=>{
  const v=createSvgVectorBudget({...SVG_VECTOR_BUDGET,textSingle:4});
  assert.equal(v.text('평가서'),null);
  assert.equal(v.text('환경영향평가'),'SVG_VECTOR_TEXT_BUDGET');
});
test('aggregate text budget counts multiple tspan runs',()=>{
  const v=createSvgVectorBudget({...SVG_VECTOR_BUDGET,textSingle:100,textTotal:5});
  assert.equal(v.text('abc'),null);
  assert.equal(v.text('def'),'SVG_VECTOR_TEXT_BUDGET');
});
test('non-path geometry untouched and counters unchanged',()=>{
  const v=createSvgVectorBudget();
  assert.equal(v.element(text()),null);
  assert.equal(v.element({localName:'rect',getAttribute:()=> 'not-path'}),null);
  assert.equal(v.element(null),null);
  assert.deepEqual(v.totals,{pathChars:0,commands:0,pointsChars:0,textChars:0});
});
test('oversized geometric input fails by a stable machine-readable reason',()=>{
  const v=createSvgVectorBudget();
  const err=v.element(path('M'+ 'L0'.repeat(150001)));
  assert.equal(err,'SVG_VECTOR_COMMAND_BUDGET');
});
