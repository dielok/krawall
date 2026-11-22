
import {describe,it,expect,vi,afterEach} from 'vitest';
const q='q01';
function makeQuestion(){
 return [
  {id:q+'.question',text:'Welches Tier?'},{id:q+'.correct',text:'Gut!'},
  {id:q+'.incorrect',text:'Nochmal!'},
  {id:q+'.answer.1',text:'Katze',correct:true,display_label:'Katze 🐈'},
  {id:q+'.answer.2',text:'Hund',correct:false},
  {id:q+'.answer.3',text:'Fisch',correct:false},
  {id:q+'.answer.4',text:'Ente',correct:false},
 ];
}
afterEach(()=>{vi.doUnmock('../input/quiz-krawall-tts.json');vi.resetModules();});
describe('malformed or partial question data',()=>{
 it('rejects missing answer entries instead of rendering a broken round',async()=>{
  const items=makeQuestion().filter(entry=>entry.id!=='q01.answer.2');
  vi.doMock('../input/quiz-krawall-tts.json',()=>({default:{question_count:1,items}}));
  const {newRound}=await import('../src/game');
  expect(()=>newRound(1,()=>0)).toThrow('Missing TTS entry q01.answer.2');
 });
 it('uses a display label only when supplied and keeps natural speech text',async()=>{
  const items=makeQuestion();
  vi.doMock('../input/quiz-krawall-tts.json',()=>({default:{question_count:1,items}}));
  const {newRound}=await import('../src/game');
  const round=newRound(1,()=>0);
  expect(round).toHaveLength(1);
  const cat=round[0].options.find(a=>a.id==='q01.answer.1');
  expect(cat).toMatchObject({label:'Katze 🐈',spoken:'Katze',correct:true});
  const dog=round[0].options.find(a=>a.id==='q01.answer.2');
  expect(dog).toMatchObject({label:'Hund',spoken:'Hund',correct:false});
 });
});
