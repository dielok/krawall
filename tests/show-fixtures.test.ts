import {afterEach,describe,it,expect,vi} from 'vitest';
afterEach(()=>{vi.doUnmock('../src/intros');vi.resetModules();});
describe('introduction catalog fallbacks',()=>{
 it('refuses a fixed category with no recorded announcements',async()=>{
  vi.resetModules();
  vi.doMock('../src/intros',()=>({introsFor:()=>[]}));
  const {createShowRound}=await import('../src/show');
  expect(()=>createShowRound(5,'animals',()=>0)).toThrow('Missing introductions for category: animals');
 });
 it('reuses intros safely only after exhausting a smaller configured catalog',async()=>{
  vi.resetModules();
  vi.doMock('../src/intros',()=>({introsFor:(id:string)=>[{id:'intro.'+id,text:'Hallo!',categoryId:id}]}));
  const {createShowRound}=await import('../src/show');
  const round=createShowRound(20,'all',()=>0);
  expect(round.blocks.length).toBeGreaterThan(4);
  expect(new Set(round.blocks.map(x=>x.intro.id)).size).toBeLessThan(round.blocks.length);
 });
});
