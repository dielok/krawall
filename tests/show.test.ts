import {describe,it,expect} from 'vitest';
import source from '../input/quiz-krawall-tts.json';
import {categories} from '../src/categories';
import {introsFor,introductions} from '../src/intros';
import {categoryCycle,createShowRound} from '../src/show';
describe('category announcements and show rounds',()=>{
 it('provides four distinct announcements per category, with stable audio ids and meaningful spoken texts',()=>{
  expect(introductions).toHaveLength(16);
  expect(new Set(introductions.map(i=>i.id)).size).toBe(16);
  for(const category of categories){
   const intros=introsFor(category.id);
   expect(intros).toHaveLength(4);
   expect(intros.every(x=>x.text.length>30)).toBe(true);
   expect(intros.every(i=>source.items.some(item=>item.id===i.id&&item.text===i.text))).toBe(true);
  }
  expect(introsFor('unknown')).toEqual([]);
 });
 it('keeps a single category for the whole round and shows only one introduction',()=>{
  const show=createShowRound(20,'animals',()=>0);
  expect(show.questions).toHaveLength(10);
  expect(show.blocks).toHaveLength(1);
  expect(show.blocks[0]).toMatchObject({categoryId:'animals',start:0,length:10});
  expect(show.questions.every(q=>categories[0].question_ids.includes(q.id))).toBe(true);
 });
 it('splits five questions into two blocks with a new topic between them',()=>{
  const show=createShowRound(5,'all',()=>0);
  expect(show.questions).toHaveLength(5);
  expect(show.blocks.map(b=>b.length)).toEqual([2,3]);
  expect(show.blocks.map(b=>b.start)).toEqual([0,2]);
  expect(show.blocks[0].categoryId).not.toBe(show.blocks[1].categoryId);
 });
 it('keeps ten questions in 2-3 question blocks across all four categories',()=>{
  const show=createShowRound(10,'all',()=>0.99);
  expect(show.questions).toHaveLength(10);
  expect(show.blocks.every(b=>b.length===2||b.length===3)).toBe(true);
  expect(new Set(show.blocks.map(b=>b.categoryId)).size).toBe(4);
  expect(show.blocks.flatMap(b=>show.questions.slice(b.start,b.start+b.length)).map(q=>q.id)).toEqual(show.questions.map(q=>q.id));
 });
 it('prevents repetitions in questions and moderator introductions across 20-question show',()=>{
  const show=createShowRound(20,'all',()=>0);
  expect(show.questions).toHaveLength(20);
  expect(new Set(show.questions.map(q=>q.id)).size).toBe(20);
  expect(show.blocks.reduce((n,b)=>n+b.length,0)).toBe(20);
  for(let i=1;i<show.blocks.length;i++)expect(show.blocks[i].categoryId).not.toBe(show.blocks[i-1].categoryId);
  expect(new Set(show.blocks.map(b=>b.intro.id)).size).toBe(show.blocks.length);
 });
 it('rotates category cycles without repeating the last category at the boundary',()=>{
  const normal=categoryCycle(()=>0.99);
  expect(normal[0].id).toBe(categories[0].id);
  const swapped=categoryCycle(()=>0.99,categories[0].id);
  expect(swapped[0].id).toBe(categories[1].id);
  expect(categoryCycle(()=>0.99,categories[2].id)[0].id).toBe(categories[0].id);
 });
 it('rejects unsupported round lengths instead of silently losing questions',()=>{
  for(const count of [0,-1,1.5,21,Number.NaN])expect(()=>createShowRound(count)).toThrow('Invalid round length');
 });
 it('supports one remaining question and both block-size random branches',()=>{
  const single=createShowRound(1,'all',()=>0);
  expect(single.blocks[0].length).toBe(1);
  const two=createShowRound(8,'all',()=>0);
  const three=createShowRound(8,'all',()=>0.99);
  expect(two.questions).toHaveLength(8);
  expect(three.questions).toHaveLength(8);
  expect(two.blocks.every(b=>b.length>=2&&b.length<=3)).toBe(true);
  expect(three.blocks.every(b=>b.length>=2&&b.length<=3)).toBe(true);
 });
});
