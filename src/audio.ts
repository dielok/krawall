export type Cue={id:string;text:string};
export class Narrator {
 enabled=true;
 private generation=0;
 private audio:HTMLAudioElement|null=null;
 private settle:(()=>void)|null=null;
 stop(){
  this.generation++;
  this.settle?.();this.settle=null;
  if(this.audio){this.audio.pause();this.audio.removeAttribute('src');this.audio=null;}
  if(typeof window.speechSynthesis !== 'undefined')window.speechSynthesis.cancel();
 }
 play(cues:Cue[],done?:()=>void){
  this.stop();if(!this.enabled){done?.();return;}
  const token=this.generation;
  void this.sequence(cues,token,done);
 }
 private async sequence(cues:Cue[],token:number,done?:()=>void){
  for(const cue of cues){if(token!==this.generation)return;await this.one(cue,token);}
  if(token===this.generation)done?.();
 }
 private async one(cue:Cue,token:number){
  const filename=encodeURIComponent(cue.id+'.mp3');
  const played=await new Promise<boolean>(resolve=>{
   const a=new Audio();this.audio=a;let settled=false;
   const finish=(v:boolean)=>{if(settled)return;settled=true;this.settle=null;resolve(v);};
   this.settle=()=>finish(false);
   a.onended=()=>finish(true);a.onerror=()=>finish(false);
   a.src=import.meta.env.BASE_URL+'audio/'+filename;
   a.play().catch(()=>finish(false));
  });
  this.audio=null;
  if(token!==this.generation||played||typeof window.speechSynthesis === 'undefined')return;
  await new Promise<void>(resolve=>{
   const u=new SpeechSynthesisUtterance(cue.text);u.lang='de-DE';u.rate=.88;u.pitch=1.1;
   const voices=speechSynthesis.getVoices();
   u.voice=voices.find(v=>v.lang.toLowerCase()==='de-de')??voices.find(v=>v.lang.startsWith('de'))??null;
   let settled=false;
   const finish=()=>{if(settled)return;settled=true;this.settle=null;resolve();};
   this.settle=finish;
   u.onend=finish;u.onerror=finish;speechSynthesis.speak(u);
  });
 }
}

