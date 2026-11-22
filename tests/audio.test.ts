import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Narrator} from '../src/audio';
const players:FakeAudio[]=[];
class FakeAudio {
 src='';onended:(()=>void)|null=null;onerror:(()=>void)|null=null;
 pause=vi.fn();removeAttribute=vi.fn();
 play=vi.fn(async()=>{});
 constructor(){players.push(this);}
}
const utterances:FakeUtterance[]=[];
class FakeUtterance {
 lang='';rate=1;pitch=1;voice:unknown=null;
 onend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 constructor(public text:string){utterances.push(this);}
}
const cancel=vi.fn(),speak=vi.fn(),getVoices=vi.fn();
beforeEach(()=>{
 players.length=0;utterances.length=0;
 cancel.mockClear();speak.mockClear();
 getVoices.mockReturnValue([{lang:'de-DE',name:'German'},{lang:'en-US',name:'English'}]);
 vi.stubGlobal('Audio',FakeAudio);
 vi.stubGlobal('SpeechSynthesisUtterance',FakeUtterance);
 vi.stubGlobal('speechSynthesis',{cancel,speak,getVoices});
});
afterEach(()=>vi.unstubAllGlobals());
const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
describe('narration',()=>{
 it('plays WAV clips in sequence without browser TTS',async()=>{
  const done=vi.fn();const n=new Narrator();
  n.play([{id:'q01.question',text:'Hallo'},{id:'q02.question',text:'Weiter'}],done);
  expect(players).toHaveLength(1);expect(players[0].src).toContain('q01.question.wav');
  players[0].onended?.();await tick();
  expect(players).toHaveLength(2);
  players[1].onended?.();await tick();
  expect(done).toHaveBeenCalledOnce();expect(speak).not.toHaveBeenCalled();
 });
 it('uses German browser speech on missing WAV and continues',async()=>{
  const done=vi.fn();const n=new Narrator();
  n.play([{id:'missing',text:'Guten Morgen'}],done);
  players[0].onerror?.();await tick();
  expect(utterances[0].text).toBe('Guten Morgen');
  expect(utterances[0].lang).toBe('de-DE');
  expect(utterances[0].voice).toEqual({lang:'de-DE',name:'German'});
  expect(speak).toHaveBeenCalledOnce();
  utterances[0].onend?.();await tick();
  expect(done).toHaveBeenCalledOnce();
 });
 it('falls back to secondary German voice or no German voice',async()=>{
  getVoices.mockReturnValue([{lang:'de-AT'},{lang:'en-US'}]);
  const n=new Narrator();n.play([{id:'missing',text:'Hallo'}]);
  players[0].onerror?.();await tick();
  expect(utterances[0].voice).toEqual({lang:'de-AT'});
  utterances[0].onerror?.();await tick();
  getVoices.mockReturnValue([{lang:'en-US'}]);
  n.play([{id:'missing-again',text:'Hallo'}]);
  players[1].onerror?.();await tick();
  expect(utterances[1].voice).toBeNull();
  utterances[1].onend?.();
 });
 it('handles rejected playback and missing speech synthesis',async()=>{
  vi.stubGlobal('Audio',class extends FakeAudio {play=vi.fn(async()=>{throw Error('blocked');});});
  vi.stubGlobal('speechSynthesis',undefined);
  const done=vi.fn();const n=new Narrator();
  n.play([{id:'missing',text:'Hallo'}],done);
  await tick();expect(done).toHaveBeenCalledOnce();
 });
 it('stops pending audio and prevents stale callbacks from advancing',async()=>{
  const n=new Narrator(),done=vi.fn();
  n.play([{id:'a',text:'A'}],done);
  n.stop();await tick();
  expect(players[0].pause).toHaveBeenCalledOnce();
  expect(done).not.toHaveBeenCalled();
  n.play([{id:'b',text:'B'}]);expect(players).toHaveLength(2);
  players[1].onended?.();await tick();
 });
 it('stops speech and ignores callbacks from superseded runs',async()=>{
  const n=new Narrator(),done=vi.fn();
  n.play([{id:'x',text:'X'}],done);
  players[0].onerror?.();await tick();
  n.stop();await tick();
  expect(cancel).toHaveBeenCalled();
  utterances[0].onend?.();await tick();
  expect(done).not.toHaveBeenCalled();
 });
 it('supports disabling narration',()=>{
  const n=new Narrator();const done=vi.fn();n.enabled=false;
  n.play([{id:'a',text:'A'}],done);
  expect(players).toHaveLength(0);expect(done).toHaveBeenCalledOnce();
 });
});


describe('narration race safety',()=>{
 it('short-circuits old queued clips after interruption',async()=>{
  const n=new Narrator(),done=vi.fn();
  n.play([{id:'first',text:'One'},{id:'second',text:'Two'}],done);
  n.stop();await tick();
  expect(players).toHaveLength(1);expect(done).not.toHaveBeenCalled();
 });
 it('ignores duplicate completion events',async()=>{
  const n=new Narrator(),done=vi.fn();
  n.play([{id:'only',text:'One'}],done);
  const completed=players[0].onended;
  completed?.();completed?.();await tick();
  expect(done).toHaveBeenCalledOnce();
 });
});
