export type SoundScene='menu'|'intro'|'question'|'waiting'|'feedback'|'results'|'pause';
const tracks={
 menu:'tunetank-children-funny-background-348019.mp3',
 waiting:'mixkit-game-show-happy-timer-666.mp3'
} as const;
const effects={
 intro:'mixkit-medieval-show-fanfare-announcement-226.mp3',
 correct:'mixkit-correct-answer-reward-952.mp3',
 wrong:'mixkit-boing-hit-sound-2894.mp3',
 results:'mixkit-end-of-show-clapping-crowd-477.mp3'
} as const;
export type SoundEffect=keyof typeof effects;
type Track=keyof typeof tracks;
export class SoundDirector{
 enabled=true;
 private music:HTMLAudioElement|null=null;
 private effect:HTMLAudioElement|null=null;
 private current:Track|null=null;
 private speaking=false;
 private scene:SoundScene='menu';
 private safePlay(audio:HTMLAudioElement){void audio.play().catch(()=>{});}
 private volume(){
  if(this.music)this.music.volume=this.speaking?.055:this.scene==='waiting'?.13:.17;
 }
 setSpeaking(active:boolean){this.speaking=active;this.volume();}
 setScene(scene:SoundScene){
  this.scene=scene;
  const track:Track|null=scene==='menu'?'menu':scene==='waiting'?'waiting':null;
  if(!this.enabled||scene==='pause'){this.stopMusic();return;}
  if(track!==this.current){
   this.stopMusic();
   if(track){
    const a=new Audio(import.meta.env.BASE_URL+'sounds/'+tracks[track]);
    a.loop=true;this.music=a;this.current=track;this.volume();this.safePlay(a);
   }
  }else this.volume();
 }
 playEffect(name:SoundEffect){
  if(!this.enabled)return;
  this.effect?.pause();
  const a=new Audio(import.meta.env.BASE_URL+'sounds/'+effects[name]);
  a.volume=name==='wrong'?.45:name==='results'?.38:.35;
  this.effect=a;
  a.onended=()=>{if(this.effect===a)this.effect=null;};
  this.safePlay(a);
 }
 setEnabled(value:boolean){
  this.enabled=value;
  if(!value){this.stopMusic();this.effect?.pause();this.effect=null;}
  else this.setScene(this.scene);
 }
 private stopMusic(){this.music?.pause();this.music=null;this.current=null;}
 stop(){this.stopMusic();this.effect?.pause();this.effect=null;}
}
