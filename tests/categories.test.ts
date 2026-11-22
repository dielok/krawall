import {describe,it,expect} from 'vitest';
import source from '../input/quiz-krawall-tts.json';
import {allCategory,categories,categoryName,questionIds} from '../src/categories';
import {newRound} from '../src/game';

describe('quiz categories',()=>{
 it('provides exactly four nontrivial categories of ten different questions',()=>{
  expect(categories).toHaveLength(4);
  const ids=categories.flatMap(c=>c.question_ids);
  expect(new Set(ids).size).toBe(40);
  expect(ids).toHaveLength(source.question_count);
  expect(categories.every(c=>c.question_ids.length>=10)).toBe(true);
  expect(categories.every(c=>!!c.name&&!!c.icon)).toBe(true);
  expect(ids.every(id=>source.items.some(row=>row.id===id+'.question'))).toBe(true);
 });
 it('preserves a full unfiltered set without mutating its source list',()=>{
  const ids=['q01','q02'];
  expect(questionIds('all',ids)).toEqual(ids);
  expect(questionIds('all',ids)).not.toBe(ids);
  expect(ids).toEqual(['q01','q02']);
  expect(categoryName('all')).toBe(allCategory.name);
 });
 it('returns copies of category ids, without touching definitions',()=>{
  const animals=questionIds('animals',[]);
  expect(animals).toEqual(categories[0].question_ids);
  animals.pop();
  expect(categories[0].question_ids).toHaveLength(10);
  expect(categoryName('animals')).toBe('Tiere');
  expect(categoryName('not-listed')).toBe('not-listed');
 });
 it('rejects unknown category identifiers instead of playing unrelated questions',()=>{
  expect(()=>questionIds('nonexistent',[])).toThrow('Unknown category: nonexistent');
 });
 it('filters randomized rounds and caps them to the category population',()=>{
  const animals=categories[0].question_ids;
  const round=newRound(20,()=>0.2,'animals');
  expect(round).toHaveLength(10);
  expect(round.every(q=>animals.includes(q.id))).toBe(true);
  const everyday=newRound(5,()=>0.2,'everyday');
  expect(everyday).toHaveLength(5);
  expect(everyday.every(q=>categories[1].question_ids.includes(q.id))).toBe(true);
  expect(newRound(40,()=>0.2,'all')).toHaveLength(40);
 });
});
