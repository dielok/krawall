import {useEffect,useRef,useState} from 'react';
import {Narrator,type Cue} from './audio';
import {SoundDirector} from './sounds';
import {phrase,result,type Question} from './game';
import {allCategory,categories,categoryName} from './categories';
import {createShowRound,type CategoryBlock} from './show';

type Screen='menu'|'instructions'|'settings'|'categories'|'categoryIntro'|'question'|'results';
type Action='UP'|'DOWN'|'CONFIRM'|'BACK'|'MENU'|'REPEAT'|'ANSWER_X'|'ANSWER_Y'|'ANSWER_B'|'ANSWER_A';
type State={screen:Screen;paused:boolean;length:5|10|20;categoryId:string;voiceOn:boolean;soundOn:boolean;round:Question[];blocks:CategoryBlock[];index:number;points:number;answered:number|null;focus:number};
const letters=['X','Y','B','A'] as const;
const colors=['blau','gelb','rot','grün'] as const;
const choices:Record<string,string[]>={menu:['start','instructions','settings'],instructions:['back'],settings:['length5','length10','length20','sound','effects','back'],categories:['category:all',...categories.map(c=>'category:'+c.id),'back'],results:['restart','menu'],pause:['resume','repeat','menu']};
// Device mapping observed on the connected controller: indices 2 and 3 report Y and X respectively.
export const padActions:Record<number,Action>={0:'ANSWER_A',1:'ANSWER_B',2:'ANSWER_Y',3:'ANSWER_X',9:'MENU',5:'REPEAT',12:'UP',13:'DOWN'};
const cue=(id:string,text=phrase(id)):Cue=>({id,text});
const padded=(value:number)=>String(value).padStart(2,'0');

export function App(){
 const [s,setS]=useState<State>({screen:'menu',paused:false,length:10,categoryId:'all',voiceOn:true,soundOn:true,round:[],blocks:[],index:0,points:0,answered:null,focus:0});
 const ref=useRef(s);ref.current=s;
 const narrator=useRef(new Narrator());
 const sounds=useRef(new SoundDirector());
 const speechPhase=useRef<'question'|'feedback'|null>(null);
 const queuedAdvance=useRef(false);
 narrator.current.onActivityChange=active=>sounds.current.setSpeaking(active);
 const timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [controller,setController]=useState('Controller: Zum Verbinden eine Taste drücken.');
 function patch(next:Partial<State>){
  ref.current={...ref.current,...next};setS(ref.current);
  const state=ref.current;
  sounds.current.setScene(state.paused?'pause':state.screen==='categoryIntro'?'intro':state.screen==='results'?'results':state.screen==='question'?(state.answered!==null?'feedback':speechPhase.current==='question'?'question':'waiting'):'menu');
 }
 function stop(){if(timeout.current!==null){clearTimeout(timeout.current);timeout.current=null;}speechPhase.current=null;queuedAdvance.current=false;narrator.current.stop();}
 function questionSpeech(q:Question,i:number){
  const lines:Cue[]=[cue('question.prefix.question_number-'+padded(i+1), 'Frage '+(i+1)+'.'),cue(q.id+'.question',q.text)];
  q.options.forEach((option,j)=>{
   const prefix=j===3?'answer.prefix.last':'answer.prefix.'+letters[j];
   const text=(j===3?'Oder ':'')+letters[j]+', '+colors[j]+':';
   lines.push(cue(prefix,text),cue(option.id,option.spoken));
  });
  speechPhase.current='question';
  sounds.current.setScene('question');
  narrator.current.play(lines,()=>{
   speechPhase.current=null;
   if(ref.current.screen==='question'&&ref.current.index===i){
    if(ref.current.answered!==null)feedbackSpeech(q,ref.current.answered);
    else sounds.current.setScene('waiting');
   }
  });
 }
 function feedbackSpeech(q:Question,i:number){
  const correct=q.options[i].correct;
  speechPhase.current='feedback';
  narrator.current.play([cue(correct?'feedback.correct':'feedback.incorrect'),cue(q.id+(correct?'.correct':'.incorrect'),correct?q.fun:q.wrong)],()=>{
   speechPhase.current=null;
   timeout.current=setTimeout(()=>advance(),queuedAdvance.current?250:ref.current.voiceOn?900:4000);
   queuedAdvance.current=false;
  });
 }
 function showIntro(index:number){
  stop();
  const block=ref.current.blocks.find(b=>b.start===index)!;
  patch({screen:'categoryIntro',index,answered:null,focus:0,paused:false});
  narrator.current.enabled=ref.current.voiceOn;
  sounds.current.playEffect('intro');
  narrator.current.play([cue(block.intro.id,block.intro.text)],()=>{
   timeout.current=setTimeout(()=>enterQuestion(index),ref.current.voiceOn?500:1500);
  });
 }
 function enterQuestion(index:number){
  if(ref.current.screen!=='categoryIntro'||ref.current.index!==index)return;
  stop();patch({screen:'question',focus:0});
  questionSpeech(ref.current.round[index],index);
 }
 function begin(){
  stop();
  const show=createShowRound(ref.current.length,ref.current.categoryId);
  patch({screen:'categoryIntro',paused:false,round:show.questions,blocks:show.blocks,index:0,points:0,answered:null,focus:0});
  showIntro(0);
 }
 function advance(){
  const current=ref.current;
  if(current.screen!=='question'||current.paused||current.answered===null)return;
  if(speechPhase.current!==null){queuedAdvance.current=true;return;}
  stop();
  if(current.index+1<current.round.length){
   const nextIndex=current.index+1;
   if(current.blocks.some(b=>b.start===nextIndex))showIntro(nextIndex);
   else{
    patch({index:nextIndex,answered:null});
    questionSpeech(current.round[nextIndex],nextIndex);
   }
  }else{
   patch({screen:'results',focus:0});
   sounds.current.playEffect('results');
   const outcome=result(current.points,current.round.length);
   narrator.current.play([cue('results.intro'),
    cue('results.score.points-'+padded(current.points)+'.total-'+padded(current.round.length),current.points+' von '+current.round.length+' Fragen richtig.'),
    cue(outcome)]);
  }
 }
 function answer(i:number){
  const state=ref.current;
  if(state.screen!=='question'||state.paused||state.answered!==null||!state.round[state.index]||i<0||i>3)return;
  const wasReading=speechPhase.current==='question';
  if(!wasReading)stop();
  const q=state.round[state.index];
  patch({answered:i,points:state.points+(q.options[i].correct?1:0)});
  sounds.current.playEffect(q.options[i].correct?'correct':'wrong');
  if(!wasReading)feedbackSpeech(q,i);
 }
 function pause(){
  stop();patch({paused:true,focus:0});
 }
 function resume(replay=false){
  const state=ref.current;
  stop();patch({paused:false,focus:0});
  if(state.answered===null||replay){
   if(state.answered===null)questionSpeech(state.round[state.index],state.index);
   else feedbackSpeech(state.round[state.index],state.answered);
  }else{
   timeout.current=setTimeout(()=>advance(),1200);
  }
 }
 function toMenu(){stop();patch({screen:'menu',paused:false,focus:0,answered:null});}
 function perform(action:string){
  const state=ref.current;
  if(action.startsWith('category:')){patch({categoryId:action.slice('category:'.length),screen:'menu',focus:0});return;}
  switch(action){
   case 'start':case 'restart':begin();break;
   case 'length5':case 'length10':case 'length20':patch({length:Number(action.slice(6)) as 5|10|20});break;
   case 'instructions':case 'settings':case 'categories':stop();patch({screen:action,focus:0});break;
   case 'menu':toMenu();break;
   case 'back':toMenu();break;
   case 'resume':resume();break;
   case 'repeat':input('REPEAT');break;
   case 'effects':sounds.current.setEnabled(!state.soundOn);patch({soundOn:!state.soundOn});break;
   case 'sound':stop();narrator.current.enabled=!state.voiceOn;patch({voiceOn:!state.voiceOn});
    if(!state.voiceOn)narrator.current.play([cue('settings.voice_on')]);break;
  }
 }
 function input(action:Action){
  const state=ref.current;
  if(action==='REPEAT'){
   if(state.screen==='categoryIntro'){showIntro(state.index);return;}
   if(state.screen==='question'){
    if(state.paused)resume(true);
    else if(state.answered===null){stop();questionSpeech(state.round[state.index],state.index);}
    else {stop();feedbackSpeech(state.round[state.index],state.answered);}
   }
   return;
  }
  if(action==='MENU'){
   if(state.screen==='question'){state.paused?resume():pause();}
   else if(state.screen==='categoryIntro')enterQuestion(state.index);
   else if(state.screen==='menu'||state.screen==='results')begin();
   else toMenu();
   return;
  }
  if(action==='BACK'){
   if(state.paused)resume();
   else if(state.screen==='categoryIntro')toMenu();
   else if(state.screen==='question')pause();
   else if(state.screen!=='menu')toMenu();
   return;
  }
  if(state.screen==='categoryIntro'){
   if(action==='CONFIRM')enterQuestion(state.index);
   return;
  }
  if(!state.paused&&state.screen==='question'){
   if(action.startsWith('ANSWER_'))answer(letters.indexOf(action.slice(7) as typeof letters[number]));
   else if(action==='CONFIRM'&&state.answered!==null)advance();
   return;
  }
  const menu=choices[state.paused?'pause':state.screen];
  if(action==='UP'||action==='DOWN')patch({focus:(state.focus+(action==='DOWN'?1:-1)+menu.length)%Math.max(menu.length,1)});
  else if(action==='CONFIRM')perform(menu[state.focus]);
 }
 const inputRef=useRef(input);inputRef.current=input;
 useEffect(()=>{
  function keydown(event:KeyboardEvent){
   if(event.repeat)return;
   const key=event.key.toLowerCase();
   let action:Action|undefined;
   if(key==='escape')action='BACK';
   else if(key==='arrowup'||key==='arrowleft')action='UP';
   else if(key==='arrowdown'||key==='arrowright')action='DOWN';
   else if(key==='enter'||key===' ')action='CONFIRM';
   else if(key==='r')action='REPEAT';
   else {
    const map:Record<string,Action>={x:'ANSWER_X',y:'ANSWER_Y',b:'ANSWER_B',a:'ANSWER_A','1':'ANSWER_X','2':'ANSWER_Y','3':'ANSWER_B','4':'ANSWER_A'};
    action=map[key];
    if(key==='b'&&(ref.current.paused||ref.current.screen!=='question'))action='BACK';
   }
   if(action){event.preventDefault();inputRef.current(action);}
  }
  window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
 },[]);
 useEffect(()=>{
  let frame=0;let prev=new Set<number>();let prevAxis='';let active:number|null=null;
  const poll=()=>{
   const pads=navigator.getGamepads?.();
   const found=pads&&([...pads].find(p=>p&&p.index===active)||[...pads].find(Boolean));
   if(found){
    if(active!==found.index){active=found.index;prev.clear();prevAxis='';setController('Controller verbunden · X Blau · Y Gelb · B Rot · A Grün');}
    const held=new Set<number>();found.buttons.forEach((b,i)=>{if(b.pressed)held.add(i);});
    const dir=found.axes[1]<-.65?'UP':found.axes[1]>.65?'DOWN':'';
    if(dir&&dir!==prevAxis)inputRef.current(dir as Action);
    prevAxis=dir;
    for(const button of held){
     if(prev.has(button))continue;
     const state=ref.current;
     if(button===9)inputRef.current('MENU');
     else if(state.paused||state.screen!=='question'){
      if(button===0)inputRef.current('CONFIRM');
      else if(button===1)inputRef.current('BACK');
      else if(button===12||button===13||button===5)inputRef.current(padActions[button]);
     }else if(button===5)inputRef.current('REPEAT');
     else if(button===0&&state.answered!==null)inputRef.current('CONFIRM');
     else if(padActions[button])inputRef.current(padActions[button]);
     break;
    }
    prev=held;
   }else if(active!==null){active=null;prev.clear();prevAxis='';setController('Controller getrennt. Maus und Tastatur funktionieren weiter.');}
   frame=requestAnimationFrame(poll);
  };
  frame=requestAnimationFrame(poll);
  return()=>cancelAnimationFrame(frame);
 },[]);
 useEffect(()=>{sounds.current.setScene('menu');return()=>{stop();sounds.current.stop();};},[]);
 const q=s.round[s.index];
 const currentBlock=s.blocks.find(block=>block.start<=s.index&&s.index<block.start+block.length);
 const blockPosition=currentBlock?s.blocks.indexOf(currentBlock)+1:0;
 const padBadge=(key:string)=> <span className={'pad-badge pad-badge--'+key.toLowerCase()} aria-label={'Controller: '+key}>{key}</span>;
 const menu=(items:{text:string;action:string;kind?:string}[],offset=0)=> <div className="menu-stack">{items.map((item,i)=><button type="button" key={item.action} className={'menu-button '+(item.kind??'')+' '+(s.focus===i+offset?'focused':'')} onMouseEnter={()=>patch({focus:i+offset})} onClick={()=>perform(item.action)}><span>{item.text}</span></button>)}</div>;
 return <div className="game" role="application" aria-label="Quiz-Krawall Kinderquiz">
  <header><div><div className="kicker">Das superduper Kinderquiz</div><div className="brand">QUIZ-KRAWALL!</div></div>
   <div className="top">{(s.screen==='question'||s.screen==='results')&&<span className="score">⭐ {s.points} {s.points===1?'Punkt':'Punkte'}</span>}{s.screen==='question'&&<button className="small-button" onClick={()=>input('MENU')}>{padBadge('START')}<span>☰ Menü</span></button>}</div></header>
  <main>
   {s.screen==='menu'&&<section className="screen"><div className="character">🎤</div><div className="eyebrow">Die große Mini-Quizshow</div><h1>Bereit für Quiz-Krawall?</h1>{menu([{text:'▶ Spiel starten',action:'start',kind:'primary'},{text:'So funktioniert’s',action:'instructions'},{text:'⚙ Einstellungen',action:'settings'},{text:'Kategorien',action:'categories'}])}<p className="category-choice">Aktuelle Auswahl: {categoryName(s.categoryId)}</p><div className="helper">Controller: Steuerkreuz + A · Tastatur: Pfeiltasten + Enter · Maus: Klicken</div></section>}
   {s.screen==='instructions'&&<section className="screen"><div className="character">🎮</div><h2>So funktioniert’s</h2><p className="info-paragraph">Höre die Frage und drücke die richtige bunte Taste. <strong>X = Blau, Y = Gelb, B = Rot, A = Grün.</strong> Alternativ X/Y/B/A oder 1–4 auf der Tastatur oder mit der Maus klicken.</p><p className="info-paragraph">Nach jeder Antwort kommt ein lustiger Spruch, dann geht es weiter. Start / Esc / ☰ pausiert das Spiel.</p>{menu([{text:'← Zurück',action:'back',kind:'primary'}])}</section>}
   {s.screen==='categories'&&<section className="screen category-screen"><div className="character">🎲</div><h2>Kategorie auswählen</h2><p className="category-explainer">Je Kategorie gibt es zehn Fragen. Bei „Alles gemischt“ sind alle vierzig dabei.</p>{menu([{text:allCategory.icon+' '+allCategory.name+(s.categoryId==='all'?' ✓':''),action:'category:all'},...categories.map(c=>({text:c.icon+' '+c.name+(s.categoryId===c.id?' ✓':''),action:'category:'+c.id})),{text:'← Zurück',action:'back'}])}</section>}
   {s.screen==='settings'&&<section className="screen"><div className="character">⚙️</div><h2>Einstellungen</h2><p>Wie viele Fragen möchtest du spielen?</p><div className="options">{([5,10,20] as const).map((n,i)=><button type="button" className={'length-btn '+(s.focus===i?'focused':'')} aria-pressed={s.length===n} key={n} onMouseEnter={()=>patch({focus:i})} onClick={()=>perform('length'+n)}><span>{n}</span></button>)}</div>{menu([{text:s.voiceOn?'🔊 Stimme an':'🔇 Stimme aus',action:'sound'},{text:s.soundOn?'♫ Musik & Effekte an':'♫ Musik & Effekte aus',action:'effects'},{text:'← Zurück zum Menü',action:'back',kind:'primary'}],3)}</section>}
   {s.screen==='categoryIntro'&&currentBlock&&<section className="screen show-intro">
    <div className="intro-eyebrow">KATEGORIE {blockPosition} VON {s.blocks.length}</div>
    <div className="intro-symbol" aria-hidden="true">{categories.find(c=>c.id===currentBlock.categoryId)!.icon}</div>
    <h1>{categoryName(currentBlock.categoryId)}</h1>
    <p className="intro-monologue" aria-live="polite">{currentBlock.intro.text}</p>
    <div className="intro-next">Danach: Frage {s.index+1} von {s.round.length}</div>
    <div className="intro-actions">
     <button type="button" className="menu-button primary" onClick={()=>enterQuestion(s.index)}>{padBadge('A')}<span>Weiter zur Frage</span></button>
     <button type="button" className="small-button" onClick={()=>input('REPEAT')}>{padBadge('R1')}<span>Ansage wiederholen</span></button>
    </div>
    <p className="helper">Automatischer Start nach der Ansage · A / Enter: Überspringen</p>
   </section>}
   {s.screen==='question'&&q&&<section className="screen question-screen"><div className="progress" aria-label="Fortschritt">{s.round.map((v,i)=><div key={v.id} className={'bar '+(i<=s.index?'active':'')}/>)}</div><div className="character">{s.answered===null?'🎤':q.options[s.answered].correct?'🎉':'🤹'}</div><div className="eyebrow">Frage {s.index+1} von {s.round.length}</div><h1>{q.text}</h1><div className="answers">{q.options.map((o,i)=><button type="button" key={o.id} data-key={letters[i]} className={'answer '+(s.answered!==null&&o.correct?'correct ':'')+(s.answered===i&&!o.correct?'wrong':'')} disabled={s.answered!==null} onClick={()=>answer(i)}><span className="letter">{letters[i]}</span><span>{o.label}</span></button>)}</div><div className="feedback" aria-live="polite">{s.answered===null?'Welche Antwort ist richtig?':<><strong>{q.options[s.answered].correct?'RICHTIG!':'NICHT GANZ!'}</strong><span>{q.options[s.answered].correct?q.fun:q.wrong}</span></>}</div><div className="toolbar"><button type="button" className="small-button" onClick={()=>input('REPEAT')}>{padBadge('R1')}<span>↻ Frage vorlesen</span></button></div><div className="helper">X Blau · Y Gelb · B Rot · A Grün · R1: Vorlesen · Start / Esc: Pause</div></section>}
   {s.screen==='results'&&<section className="screen"><div className="character">🏆</div><div className="eyebrow">Geschafft!</div><h1>Das war Quiz-Krawall!</h1><div className="result-number">{s.points} / {s.round.length}</div><p className="muted">{phrase(result(s.points,s.round.length))}</p>{menu([{text:'↻ Nochmal spielen',action:'restart',kind:'primary'},{text:'⌂ Zum Hauptmenü',action:'menu'}])}</section>}
  </main>
  {s.paused&&<div className="pause-overlay"><div className="pause-panel"><div className="character">⏸️</div><h2>Pause</h2>{menu([{text:'▶ Weiterspielen',action:'resume',kind:'primary'},{text:'↻ Frage wiederholen',action:'repeat'},{text:'⌂ Zum Hauptmenü',action:'menu',kind:'danger'}])}<div className="helper">A / Enter: Auswählen · B / Esc: Zurück</div></div></div>}
  <div className="gamepadinfo" role="status">🎮 {controller}</div>
 </div>;
}

