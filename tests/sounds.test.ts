import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {SoundDirector} from '../src/sounds';
const players:FakeAudio[]=[];
class FakeAudio {
 loop=false;volume=1;onended:(()=>void)|null=null;
 pause=vi.fn();
 play=vi.fn(async()=>{});
 constructor(public src:string){players.push(this);}
}
beforeEach(()=>{players.length=0;vi.stubGlobal('Audio',FakeAudio);});
afterEach(()=>vi.unstubAllGlobals());
describe('SoundDirector',()=>{
 it('loops menu background, switches to a timer while waiting and ducks under the narrator',()=>{
  const s=new SoundDirector();
  s.setScene('menu');expect(players[0].src).toContain('tunetank-children-funny-background');
  expect(players[0].loop).toBe(true);expect(players[0].volume).toBe(.17);
  s.setScene('menu');expect(players).toHaveLength(1);
  s.setSpeaking(true);expect(players[0].volume).toBe(.055);
  s.setScene('question');expect(players[0].pause).toHaveBeenCalledOnce();
  s.setScene('waiting');expect(players[1].src).toContain('mixkit-game-show-happy-timer');
  expect(players[1].volume).toBe(.055);
  s.setSpeaking(false);expect(players[1].volume).toBe(.13);
  s.setScene('waiting');expect(players).toHaveLength(2);
  s.setScene('pause');expect(players[1].pause).toHaveBeenCalled();
 });
 it('plays fanfare and distinct correct, wrong and results effects with appropriate volumes',()=>{
  const s=new SoundDirector();
  s.playEffect('intro');expect(players[0].src).toContain('fanfare');
  expect(players[0].volume).toBe(.35);
  const first=players[0];
  s.playEffect('correct');expect(first.pause).toHaveBeenCalledOnce();
  const correct=players[1];expect(correct.src).toContain('correct-answer-reward');
  first.onended?.();
  s.playEffect('wrong');expect(correct.pause).toHaveBeenCalledOnce();
  expect(players[2].volume).toBe(.45);
  const wrong=players[2];wrong.onended?.();
  s.playEffect('results');expect(players[3].volume).toBe(.38);
  players[3].onended?.();
  s.stop();
 });
 it('mutes both music and effects, resumes music after unmuting, and cleans up',()=>{
  const s=new SoundDirector();s.setScene('menu');s.playEffect('intro');
  s.setEnabled(false);
  expect(players[0].pause).toHaveBeenCalled();
  expect(players[1].pause).toHaveBeenCalled();
  s.playEffect('wrong');expect(players).toHaveLength(2);
  s.setScene('waiting');expect(players).toHaveLength(2);
  s.setEnabled(true);
  expect(players[2].src).toContain('timer');
  s.playEffect('wrong');s.stop();
  expect(players[2].pause).toHaveBeenCalledOnce();
  expect(players[3].pause).toHaveBeenCalledOnce();
 });
 it('tolerates rejected autoplay promises',async()=>{
  vi.stubGlobal('Audio',class extends FakeAudio {
   play=vi.fn(async()=>{throw new Error('autoplay blocked');});
  });
  const s=new SoundDirector();s.setScene('menu');s.playEffect('intro');
  await Promise.resolve();await Promise.resolve();
  expect(players[0].play).toHaveBeenCalledOnce();
  expect(players[1].play).toHaveBeenCalledOnce();
 });
 it('does not restart a soundtrack while changing between silent scenes',()=>{
  const s=new SoundDirector();
  s.setScene('intro');s.setScene('feedback');s.setScene('results');s.setScene('pause');
  expect(players).toHaveLength(0);
  s.setEnabled(false);s.setEnabled(true);expect(players).toHaveLength(0);
  s.stop();
 });
});
