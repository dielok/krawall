import {describe,it,expect,vi} from 'vitest';
import data from '../input/quiz-krawall-tts.json';
import {newRound,phrase,shuffle,result} from '../src/game';
describe('question bank and randomization',()=>{
 it('contains 40 complete playable questions',()=>{
  expect(data.question_count).toBe(40);
  const round=newRound(40,()=>0.1);
  expect(round).toHaveLength(40);
  expect(new Set(round.map(q=>q.id)).size).toBe(40);
  for(const q of round){
   expect(q.text).toBeTruthy();
   expect(q.fun).toBeTruthy();
   expect(q.wrong).toBeTruthy();
   expect(q.options).toHaveLength(4);
   expect(q.options.filter(o=>o.correct)).toHaveLength(1);
   expect(q.options.every(o=>!!o.label&&!!o.spoken)).toBe(true);
  }
 });
 it('exposes optional voice strings and missing identifiers',()=>{
  expect(phrase('welcome.title')).toBe('Bereit für Quiz-Krawall?');
  expect(phrase('does.not.exist')).toBe('');
 });
 it('shuffles an immutable copy with injected RNG',()=>{
  const list=[1,2,3,4];
  expect(shuffle(list,()=>0)).toEqual([2,3,4,1]);
  expect(list).toEqual([1,2,3,4]);
  expect(shuffle([],()=>0)).toEqual([]);
  expect(shuffle([1],()=>0)).toEqual([1]);
 });
 it('changes question order and answer order with different random values',()=>{
  const first=newRound(10,()=>0);
  const other=newRound(10,()=>0.99);
  expect(first.map(q=>q.id)).not.toEqual(other.map(q=>q.id));
  expect(first[0].options.map(o=>o.id)).not.toEqual(other.find(q=>q.id===first[0].id)?.options.map(o=>o.id));
 });
 it.each([5,10,20])('supports %i questions',size=>{
  expect(newRound(size)).toHaveLength(size);
 });
 it('evaluates perfect, strong and encouraging results',()=>{
  expect(result(5,5)).toBe('results.perfect');
  expect(result(8,10)).toBe('results.great');
  expect(result(7,10)).toBe('results.encourage');
  expect(result(0,5)).toBe('results.encourage');
 });
 it('uses displayed and spoken text separately',()=>{
  const q=newRound(20,()=>0)[0];
  expect(q.options.every(o=>!!o.label&&!!o.spoken)).toBe(true);
  const records=data.items.filter(i=>i.id.endsWith('.answer.1'));
  expect(records.some(i=>'display_label' in i&&i.display_label!==i.text)).toBe(true);
 });
});
