import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,cleanup,act} from '@testing-library/react';
import {App} from '../src/App';
const narrator=vi.hoisted(()=>({play:vi.fn(),stop:vi.fn(),enabled:true,activity:null as null|((active:boolean)=>void)}));
const sound=vi.hoisted(()=>({setScene:vi.fn(),setSpeaking:vi.fn(),playEffect:vi.fn(),setEnabled:vi.fn(),stop:vi.fn()}));
vi.mock('../src/sounds',()=>({SoundDirector:class {setScene= sound.setScene;setSpeaking=sound.setSpeaking;playEffect=sound.playEffect;setEnabled=sound.setEnabled;stop=sound.stop;}}));
vi.mock('../src/audio',()=>({
 Narrator:class {get enabled(){return narrator.enabled;}set enabled(v:boolean){narrator.enabled=v;}
  set onActivityChange(callback:(active:boolean)=>void){narrator.activity=callback;}
  play(cues:unknown[],done?:()=>void){narrator.play(cues,done);}
  stop(){narrator.stop();}}
}));
let pad:Gamepad|null=null;
let frameCallback:FrameRequestCallback|undefined;
function key(k:string){fireEvent.keyDown(window,{key:k});}
function click(label:RegExp|string){fireEvent.click(screen.getByRole('button',{name:label}));}
function skipIntro(){const next=screen.queryByRole('button',{name:/Weiter zur Frage/});if(next)fireEvent.click(next);}
function startQuiz(){click(/Spiel starten/);skipIntro();}
function tickPad(button:number){
 if(!pad)throw Error('No controller');
 (pad.buttons as GamepadButton[])[button]={pressed:true,touched:true,value:1};
 act(()=>frameCallback?.(0));
 (pad.buttons as GamepadButton[])[button]={pressed:false,touched:false,value:0};
 act(()=>frameCallback?.(0));
}
beforeEach(()=>{
 narrator.activity=null;narrator.play.mockReset();narrator.play.mockImplementation((cues:unknown[],done?:()=>void)=>{if(cues.length>5||cues.length===2)done?.();});narrator.stop.mockReset();narrator.enabled=true;
 for(const fn of Object.values(sound))fn.mockReset();
 pad=null;frameCallback=undefined;
 vi.stubGlobal('requestAnimationFrame',vi.fn((f:FrameRequestCallback)=>{frameCallback=f;return 1;}));
 vi.stubGlobal('cancelAnimationFrame',vi.fn());
 vi.stubGlobal('navigator',Object.assign(Object.create(navigator),{getGamepads:()=>pad?[pad]:[]}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
describe('quiz app interaction',()=>{
 it('renders menu and instructions and navigates back via keyboard',()=>{
  render(<App/>);
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
  click('So funktioniert’s');
  expect(screen.getByText('So funktioniert’s',{selector:'h2'})).toBeTruthy();
  key('Escape');
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
 });
 it('supports menu focus and enter selection',()=>{
  render(<App/>);
  key('ArrowDown');key('Enter');
  expect(screen.getByText('So funktioniert’s',{selector:'h2'})).toBeTruthy();
  key('b');
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
 });
 it('configures 5, 10, 20 questions and speech state',()=>{
  render(<App/>);
  click('⚙ Einstellungen');
  click('5');expect(screen.getByRole('button',{name:'5'}).getAttribute('aria-pressed')).toBe('true');
  click('10');expect(screen.getByRole('button',{name:'10'}).getAttribute('aria-pressed')).toBe('true');
  click('20');expect(screen.getByRole('button',{name:'20'}).getAttribute('aria-pressed')).toBe('true');
  click(/Stimme an/);
  expect(screen.getByText('🔇 Stimme aus')).toBeTruthy();
  click(/Stimme aus/);
  expect(narrator.play).toHaveBeenCalled();
  key('Escape');startQuiz();
  expect(screen.getByText('Frage 1 von 20')).toBeTruthy();
 });
 it('runs question, repeat, feedback and next-question flow',()=>{
  render(<App/>);startQuiz();
  expect(screen.getAllByRole('button').length).toBeGreaterThan(4);
  const calls=narrator.play.mock.calls.length;
  key('r');
  expect(narrator.play.mock.calls.length).toBe(calls+1);
  const options=screen.getAllByRole('button').filter(b=>b.classList.contains('answer'));
  fireEvent.click(options[0]);
  expect(screen.getByText(/RICHTIG!|NICHT GANZ!/)).toBeTruthy();
  key('Enter');skipIntro();
  expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
 it('handles pause, replay and resume through header button',()=>{
  render(<App/>);startQuiz();
  click(/Menü/);
  expect(screen.getByText('Pause')).toBeTruthy();
  click(/Frage wiederholen/);
  expect(screen.queryByText('Pause')).toBeNull();
  key('Escape');expect(screen.getByText('Pause')).toBeTruthy();
  key('Escape');expect(screen.queryByText('Pause')).toBeNull();
  key('Escape');click(/Zum Hauptmenü/);
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
 });
 it('navigates result screen and restarts after correct and incorrect answers',()=>{
  render(<App/>);click('⚙ Einstellungen');click('5');click(/Zurück zum Menü/);startQuiz();
  for(let i=0;i<5;i++){
   const buttons=screen.getAllByRole('button').filter(b=>b.classList.contains('answer'));
   fireEvent.click(buttons[i%4]);
   key('Enter');skipIntro();
  }
  expect(screen.getByText('Das war Quiz-Krawall!')).toBeTruthy();
  click(/Nochmal spielen/);skipIntro();
  expect(screen.getByText('Frage 1 von 5')).toBeTruthy();
  key('Escape');click(/Zum Hauptmenü/);
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
 });
 it('responds to controller navigation, selection and start',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0,vibrationActuator:null,hapticActuators:[]} as unknown as Gamepad;
  render(<App/>);
  act(()=>frameCallback?.(0));
  expect(screen.getByText(/Controller verbunden/)).toBeTruthy();
  tickPad(13);tickPad(0);
  expect(screen.getByText('So funktioniert’s',{selector:'h2'})).toBeTruthy();
  tickPad(1);tickPad(9);tickPad(0);
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  tickPad(5);
  expect(narrator.play.mock.calls.length).toBeGreaterThan(1);
  tickPad(9);expect(screen.getByText('Pause')).toBeTruthy();
  tickPad(0);expect(screen.queryByText('Pause')).toBeNull();
  pad=null;act(()=>frameCallback?.(0));
  expect(screen.getByText(/Controller getrennt/)).toBeTruthy();
 });
 it('does not answer twice and handles start and back navigation',()=>{
  render(<App/>);key('Enter');key('Enter');
  key('x');const first=screen.getByText(/RICHTIG!|NICHT GANZ!/).textContent;
  key('y');expect(screen.getByText(/RICHTIG!|NICHT GANZ!/).textContent).toBe(first);
  key('Escape');expect(screen.getByText('Pause')).toBeTruthy();
  click(/Weiterspielen/);expect(screen.queryByText('Pause')).toBeNull();
  key('Enter');skipIntro();expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
});


describe('additional controller and audio transitions',()=>{
 it('waits for spoken feedback before automatically advancing',()=>{
  vi.useFakeTimers();
  render(<App/>);startQuiz();key('x');
  const call=narrator.play.mock.calls.at(-1);
  expect(call?.[1]).toBeTypeOf('function');
  act(()=>call?.[1]?.());
  act(()=>vi.advanceTimersByTime(950));skipIntro();
  expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
 it('supports spoken feedback replay during and after pause',()=>{
  render(<App/>);startQuiz();
  key('x');const plays=narrator.play.mock.calls.length;
  key('r');expect(narrator.play.mock.calls.length).toBeGreaterThan(plays);
  key('Escape');expect(screen.getByText('Pause')).toBeTruthy();
  click(/Frage wiederholen/);expect(screen.queryByText('Pause')).toBeNull();
  expect(narrator.play.mock.calls.length).toBeGreaterThan(plays+1);
 });
 it('returns from settings with Start and repeats with R1 on gamepad',()=>{
  render(<App/>);click('⚙ Einstellungen');
  key('Escape');startQuiz();key('Escape');
  key('Escape');key('Escape');expect(screen.getByText('Pause')).toBeTruthy();
  click(/Zum Hauptmenü/);click('⚙ Einstellungen');
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  act(()=>frameCallback?.(0));tickPad(9);
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
 });
 it('uses face buttons to answer and A to advance on a controller',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);
  act(()=>frameCallback?.(0));
  tickPad(9);tickPad(0);
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  tickPad(2);
  expect(screen.getByText(/RICHTIG!|NICHT GANZ!/)).toBeTruthy();
  tickPad(0);skipIntro();
  expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
 it('allows controller A to start, D-pad to choose and B to return',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);
  act(()=>frameCallback?.(0));tickPad(0);tickPad(0);
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  // B remains the red answer during gameplay; Start pauses, B returns in menus.
  tickPad(1);
  expect(screen.getByText(/RICHTIG!|NICHT GANZ!/)).toBeTruthy();
  tickPad(9);
  expect(screen.getByText('Pause')).toBeTruthy();
  tickPad(1);
  expect(screen.queryByText('Pause')).toBeNull();
 });
});


describe('branch completion: navigation, callbacks and gamepad states',()=>{
 it('executes menu hover, settings focus and question replay button callbacks',()=>{
  render(<App/>);
  fireEvent.mouseEnter(screen.getByRole('button',{name:'So funktioniert’s'}));
  key('Enter');expect(screen.getByText('So funktioniert’s',{selector:'h2'})).toBeTruthy();
  click(/Zurück/);click('⚙ Einstellungen');
  fireEvent.mouseEnter(screen.getByRole('button',{name:'5'}));
  key('Enter');expect(screen.getByRole('button',{name:'5'}).getAttribute('aria-pressed')).toBe('true');
  key('Escape');startQuiz();
  click(/Frage vorlesen/);expect(narrator.play.mock.calls.length).toBeGreaterThan(1);
 });
 it('covers key repeat, left, up and unknown keys',()=>{
  render(<App/>);key('ArrowDown');key('ArrowUp');
  fireEvent.keyDown(window,{key:'ArrowDown',repeat:true});
  fireEvent.keyDown(window,{key:'n'});
  key('ArrowLeft');key('ArrowRight');
  key('Enter');skipIntro();expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
 it('uses shorter silent-feedback timing and ignores delayed callbacks on new questions',()=>{
  vi.useFakeTimers();render(<App/>);
  click('⚙ Einstellungen');click(/Stimme an/);click(/Zurück zum Menü/);startQuiz();
  key('x');expect(screen.getByText(/RICHTIG!|NICHT GANZ!/)).toBeTruthy();
  key('Enter');skipIntro();expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
  key('x');key('Enter');skipIntro();expect(screen.getByText('Frage 3 von 10')).toBeTruthy();
  // With voice off, feedback is scheduled on the 4-second path only when narrator completes.
 });
 it('ignores a delayed feedback callback after quitting the round',()=>{
  vi.useFakeTimers();render(<App/>);startQuiz();key('x');
  const done=narrator.play.mock.calls.at(-1)?.[1] as (()=>void)|undefined;
  expect(done).toBeTypeOf('function');
  key('Escape');click(/Zum Hauptmenü/);
  act(()=>done?.());act(()=>vi.advanceTimersByTime(900));
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
 });
 it('handles old voice callbacks after the next question has started',()=>{
  vi.useFakeTimers();render(<App/>);startQuiz();key('x');
  const done=narrator.play.mock.calls.at(-1)?.[1] as (()=>void)|undefined;
  key('Enter');expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
  act(()=>done?.());act(()=>vi.advanceTimersByTime(900));
  expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
 it('handles controller stick, held inputs, menu back, D-pad and menu repeat',()=>{
  const buttons=Array.from({length:16},()=>({pressed:false,touched:false,value:0}));
  pad={index:0,buttons,axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);act(()=>frameCallback?.(0));
  (pad.axes as number[])[1]=1;act(()=>frameCallback?.(0));
  act(()=>frameCallback?.(0)); // held stick should not repeat
  (pad.axes as number[])[1]=0;act(()=>frameCallback?.(0));
  (pad.axes as number[])[1]=-1;act(()=>frameCallback?.(0));
  (pad.axes as number[])[1]=0;act(()=>frameCallback?.(0));
  tickPad(13);tickPad(12);
  tickPad(0);tickPad(0);expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  tickPad(9);expect(screen.getByText('Pause')).toBeTruthy();
  tickPad(13);tickPad(12);tickPad(5); // menu navigation and replay
  expect(screen.queryByText('Pause')).toBeNull();
 });
 it('does not process button held continuously across animation frames',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);act(()=>frameCallback?.(0));
  (pad.buttons as GamepadButton[])[0]={pressed:true,touched:true,value:1};
  act(()=>frameCallback?.(0));act(()=>frameCallback?.(0));
  expect(screen.getByText('KATEGORIE 1 VON', {exact:false})).toBeTruthy();
  (pad.buttons as GamepadButton[])[0]={pressed:false,touched:false,value:0};
  act(()=>frameCallback?.(0));
  tickPad(0);
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
});

describe('remaining moderator and pause branches',()=>{
 it('advances after silent audio callbacks using the longer feedback delay',()=>{
  vi.useFakeTimers();
  render(<App/>);
  click('⚙ Einstellungen');click(/Stimme an/);click(/Zurück zum Menü/);startQuiz();
  key('x');
  const complete=narrator.play.mock.calls.at(-1)?.[1] as (()=>void)|undefined;
  expect(complete).toBeTypeOf('function');
  act(()=>complete?.());
  act(()=>vi.advanceTimersByTime(3999));
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  act(()=>vi.advanceTimersByTime(1));skipIntro();
  expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
 it('uses controller Start to both pause and resume an active question',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);act(()=>frameCallback?.(0));
  tickPad(0);tickPad(0);tickPad(9);
  expect(screen.getByText('Pause')).toBeTruthy();
  tickPad(9);
  expect(screen.queryByText('Pause')).toBeNull();
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
});

describe('category menu',()=>{
 it('offers all categories with ten questions each and a mixed choice',()=>{
  render(<App/>);
  click('Kategorien');
  expect(screen.getByText('Kategorie auswählen')).toBeTruthy();
  expect(screen.getByRole('button',{name:/Alles gemischt/})).toBeTruthy();
  expect(screen.getByRole('button',{name:/Tiere/})).toBeTruthy();
  expect(screen.getByRole('button',{name:/Alltag/})).toBeTruthy();
  expect(screen.getByRole('button',{name:/Natur & Jahreszeiten/})).toBeTruthy();
  expect(screen.getByRole('button',{name:/Essen & Farben/})).toBeTruthy();
  click(/Tiere/);
  expect(screen.getByText('Aktuelle Auswahl: Tiere')).toBeTruthy();
  startQuiz();
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
 it('selects other categories and mixed mode via keyboard and mouse',()=>{
  render(<App/>);
  click('Kategorien');click(/Alltag/);
  expect(screen.getByText('Aktuelle Auswahl: Alltag')).toBeTruthy();
  click('Kategorien');click(/Natur & Jahreszeiten/);
  expect(screen.getByText('Aktuelle Auswahl: Natur & Jahreszeiten')).toBeTruthy();
  click('Kategorien');click(/Essen & Farben/);
  expect(screen.getByText('Aktuelle Auswahl: Essen & Farben')).toBeTruthy();
  click('Kategorien');key('Escape');
  expect(screen.getByText('Aktuelle Auswahl: Essen & Farben')).toBeTruthy();
  click('Kategorien');key('Enter');
  expect(screen.getByText('Aktuelle Auswahl: Alles gemischt')).toBeTruthy();
  startQuiz();expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
 it('limits a configured 20-question round to its ten-question category',()=>{
  render(<App/>);
  click('⚙ Einstellungen');click('20');click(/Zurück zum Menü/);
  click('Kategorien');click(/Tiere/);startQuiz();
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
});


describe('automatic category-intro transitions',()=>{
 it('shows the introduction until the recording has ended and then starts the first question',()=>{
  vi.useFakeTimers();
  render(<App/>);
  click(/Spiel starten/);
  expect(screen.getByText('KATEGORIE 1 VON',{exact:false})).toBeTruthy();
  const last=narrator.play.mock.calls.at(-1);
  expect((last?.[0] as {id:string;text:string}[])[0].id).toMatch(/^category\.intro\./);
  expect(last?.[1]).toBeTypeOf('function');
  act(()=>last?.[1]?.());
  act(()=>vi.advanceTimersByTime(499));
  expect(screen.getByText('KATEGORIE 1 VON',{exact:false})).toBeTruthy();
  act(()=>vi.advanceTimersByTime(1));
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
 it('keeps an extra 1.5 seconds of title time when voice is disabled',()=>{
  vi.useFakeTimers();
  render(<App/>);
  click('⚙ Einstellungen');click(/Stimme an/);click(/Zurück zum Menü/);
  click(/Spiel starten/);
  const completed=narrator.play.mock.calls.at(-1)?.[1] as (()=>void)|undefined;
  act(()=>completed?.());
  act(()=>vi.advanceTimersByTime(1499));
  expect(screen.getByText('KATEGORIE 1 VON',{exact:false})).toBeTruthy();
  act(()=>vi.advanceTimersByTime(1));
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
 it('ignores outdated category callbacks after skipping or leaving the round',()=>{
  vi.useFakeTimers();render(<App/>);click(/Spiel starten/);
  const complete=narrator.play.mock.calls.at(-1)?.[1] as (()=>void)|undefined;
  click(/Weiter zur Frage/);
  act(()=>complete?.());act(()=>vi.advanceTimersByTime(650));
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  key('Escape');click(/Zum Hauptmenü/);
  act(()=>complete?.());act(()=>vi.advanceTimersByTime(650));
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
 });
 it('can repeat and skip category announcements with keyboard, controller-style menu, and mouse',()=>{
  render(<App/>);click(/Spiel starten/);
  const before=narrator.play.mock.calls.length;
  key('r');expect(narrator.play.mock.calls.length).toBe(before+1);
  click(/Ansage wiederholen/);expect(narrator.play.mock.calls.length).toBe(before+2);
  key('ArrowDown');
  key('Escape');expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
  click(/Spiel starten/);key('Enter');
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
 it('automatically introduces a new category after the previous block',()=>{
  render(<App/>);click(/Spiel starten/);skipIntro();
  const firstQuestions=screen.getByText('Frage 1 von 10');
  expect(firstQuestions).toBeTruthy();
  let progress=1;
  while(screen.queryByText('Frage '+progress+' von 10') && progress<=3){
   const ans=screen.getAllByRole('button').find(b=>b.classList.contains('answer'));
   if(!ans)break;
   fireEvent.click(ans);
   key('Enter');
   progress++;
   if(screen.queryByText('KATEGORIE 2 VON',{exact:false}))break;
  }
  expect(screen.getByText('KATEGORIE 2 VON',{exact:false})).toBeTruthy();
  skipIntro();
  expect(screen.getByText('Frage '+progress+' von 10')).toBeTruthy();
 });
});


describe('controller Start on the category announcement',()=>{
 it('skips the announced topic and goes straight to its first question',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);act(()=>frameCallback?.(0));
  tickPad(9);expect(screen.getByText('KATEGORIE 1 VON',{exact:false})).toBeTruthy();
  tickPad(9);expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
});


describe('controller color mapping and sound cues',()=>{
 it('maps physical button 2 to yellow Y and button 3 to blue X',()=>{
  for(const [button,letter] of [[2,'Y'],[3,'X']] as const){
   cleanup();
   pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Gamepad',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
   render(<App/>);act(()=>frameCallback?.(0));tickPad(9);tickPad(0);
   const answer=screen.getAllByRole('button').find(b=>b.getAttribute('data-key')===letter)!;
   tickPad(button);
   expect(answer.getAttribute('disabled')).not.toBeNull();
   const selected=screen.getAllByRole('button').filter(b=>b.classList.contains('answer')).find(b=>b.classList.contains('wrong')||b.classList.contains('correct')&&b===answer);
   if(answer.classList.contains('correct'))expect(answer.classList.contains('correct')).toBe(true);
   else expect(answer.classList.contains('wrong')).toBe(true);
  }
 });
 it('plays distinct fanfare, feedback and results effects while retaining a settings switch',()=>{
  render(<App/>);
  expect(sound.setScene).toHaveBeenCalledWith('menu');
  click(/Spiel starten/);
  expect(sound.playEffect).toHaveBeenCalledWith('intro');
  skipIntro();
  const answer=screen.getAllByRole('button').find(b=>b.classList.contains('answer'))!;
  fireEvent.click(answer);
  expect(sound.playEffect).toHaveBeenCalledWith(answer.classList.contains('correct')?'correct':'wrong');
  key('Escape');click(/Zum Hauptmenü/);click('⚙ Einstellungen');
  click(/Musik & Effekte an/);
  expect(sound.setEnabled).toHaveBeenCalledWith(false);
  click(/Musik & Effekte aus/);
  expect(sound.setEnabled).toHaveBeenCalledWith(true);
 });
 it('stops a playing question immediately on answer and starts complete feedback',()=>{
  render(<App/>);
  click(/Spiel starten/);skipIntro();
  narrator.play.mockImplementation(()=>{});
  key('r'); // a slow, still-playing question
  const readingDone=narrator.play.mock.calls.at(-1)?.[1] as (()=>void)|undefined;
  expect(readingDone).toBeTypeOf('function');
  const stops=narrator.stop.mock.calls.length;
  const plays=narrator.play.mock.calls.length;
  key('x');
  expect(narrator.stop.mock.calls.length).toBe(stops+1);
  expect(narrator.play.mock.calls.length).toBe(plays+1);
  expect(screen.getByText(/RICHTIG!|NICHT GANZ!/)).toBeTruthy();
  const feedback=narrator.play.mock.calls.at(-1);
  expect((feedback?.[0] as {id:string}[])[0].id).toMatch(/^feedback\./);
  act(()=>readingDone?.()); // stale question completion must not supersede feedback
  expect(narrator.play.mock.calls.length).toBe(plays+1);
  key('Enter'); // fast navigation must still wait for the feedback voice
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  const finishFeedback=feedback?.[1] as (()=>void)|undefined;
  expect(finishFeedback).toBeTypeOf('function');
  act(()=>finishFeedback?.());
 });
 it('interrupts both keyboard and mouse question playback for an answer',()=>{
  render(<App/>);click(/Spiel starten/);skipIntro();
  narrator.play.mockImplementation(()=>{});
  key('r');
  const beforeStop=narrator.stop.mock.calls.length;
  const answer=screen.getAllByRole('button').find(b=>b.classList.contains('answer'))!;
  fireEvent.click(answer);
  expect(narrator.stop.mock.calls.length).toBe(beforeStop+1);
  expect(narrator.play.mock.calls.at(-1)?.[0]).toHaveLength(2);
 });
 it('queues immediate Enter until the feedback voice finishes',()=>{
  render(<App/>);click(/Spiel starten/);skipIntro();
  narrator.play.mockImplementation(()=>{});
  key('x');const finish=narrator.play.mock.calls.at(-1)?.[1] as (()=>void)|undefined;
  expect(finish).toBeTypeOf('function');
  key('Enter');
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  act(()=>finish?.());
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
 });
});


describe('sound activation and defensive progression',()=>{
 it('automatically ducks the sound director when narration starts and restores afterwards',()=>{
  render(<App/>);
  expect(narrator.activity).toBeTypeOf('function');
  act(()=>narrator.activity?.(true));
  expect(sound.setSpeaking).toHaveBeenCalledWith(true);
  act(()=>narrator.activity?.(false));
  expect(sound.setSpeaking).toHaveBeenCalledWith(false);
 });
 it('ignores an expired advancement when paused, back in menu or on an unanswered question',()=>{
  vi.useFakeTimers();
  const spy=vi.spyOn(globalThis,'setTimeout');
  render(<App/>);startQuiz();
  key('x');
  const expired=spy.mock.calls.at(-1)?.[0] as (()=>void)|undefined;
  expect(expired).toBeTypeOf('function');
  key('Escape');
  act(()=>expired?.()); // a late timer must not bypass pause
  expect(screen.getByText('Pause')).toBeTruthy();
  click(/Zum Hauptmenü/);
  act(()=>expired?.()); // a stale timer must not leave the main menu
  expect(screen.getByText('Bereit für Quiz-Krawall?')).toBeTruthy();
  startQuiz();
  act(()=>expired?.()); // a stale timer must not skip an unanswered question
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  spy.mockRestore();
 });
});

describe('adaptive keyboard and controller hints',()=>{
 it('defaults to keyboard labels on the main menu and category intro',()=>{
  render(<App/>);
  expect(screen.getByText('Pfeiltasten: Auswahl',{exact:false})).toBeTruthy();
  expect(screen.getByRole('button',{name:/Spiel starten/}).textContent).toContain('Enter');
  click(/Spiel starten/);
  expect(screen.getByRole('button',{name:/Weiter zur Frage/}).textContent).toContain('Enter');
  expect(screen.getByRole('button',{name:/Ansage wiederholen/}).textContent).toContain('R');
  expect(screen.getByText(/Enter: Überspringen/)).toBeTruthy();
  key('a');expect(screen.getByText('KATEGORIE 1 VON',{exact:false})).toBeTruthy();
 });
 it('switches to gamepad hints on connection and updates intro actions',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);act(()=>frameCallback?.(0));
  expect(screen.getByRole('button',{name:/Spiel starten/}).textContent).toContain('A');
  tickPad(9);
  expect(screen.getByRole('button',{name:/Weiter zur Frage/}).textContent).toContain('A');
  expect(screen.getByRole('button',{name:/Ansage wiederholen/}).textContent).toContain('R1');
  expect(screen.getByText(/A: Überspringen/)).toBeTruthy();
  tickPad(0);
  expect(screen.getByRole('button',{name:/Frage vorlesen/}).textContent).toContain('R1');
  expect(screen.getByRole('button',{name:/Menü/}).textContent).toContain('Start');
  const keys=screen.getAllByRole('button').filter(b=>b.classList.contains('answer')).map(b=>b.querySelector('.letter')?.textContent);
  expect(keys).toEqual(['X','Y','B','A']);
 });
 it('uses keyboard numbers after a key press even with gamepad still connected and returns to pad on button press',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);act(()=>frameCallback?.(0));tickPad(9);tickPad(0);
  key('r');
  expect(screen.getAllByRole('button').filter(b=>b.classList.contains('answer')).map(b=>b.querySelector('.letter')?.textContent)).toEqual(['1','2','3','4']);
  expect(screen.getByRole('button',{name:/Frage vorlesen/}).textContent).toContain('R');
  tickPad(5);
  expect(screen.getAllByRole('button').filter(b=>b.classList.contains('answer')).map(b=>b.querySelector('.letter')?.textContent)).toEqual(['X','Y','B','A']);
  pad=null;act(()=>frameCallback?.(0));
  expect(screen.getAllByRole('button').filter(b=>b.classList.contains('answer')).map(b=>b.querySelector('.letter')?.textContent)).toEqual(['1','2','3','4']);
 });
 it('displays correct pause-menu shortcuts and restores keyboard mode after using mouse',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);act(()=>frameCallback?.(0));tickPad(9);tickPad(0);tickPad(9);
  expect(screen.getByRole('button',{name:/Weiterspielen/}).textContent).toContain('A');
  expect(screen.getByRole('button',{name:/Frage wiederholen/}).textContent).toContain('R1');
  fireEvent.mouseEnter(screen.getByRole('button',{name:/Weiterspielen/}));
  expect(screen.getByRole('button',{name:/Weiterspielen/}).textContent).toContain('Enter');
  expect(screen.getByRole('button',{name:/Frage wiederholen/}).textContent).toContain('R');
  expect(screen.getByText(/Esc: Zurück/)).toBeTruthy();
 });
 it('uses keyboard hints in the settings and returns to controller on D-pad',()=>{
  render(<App/>);click('⚙ Einstellungen');
  expect(screen.getByText(/Enter: Bestätigen/)).toBeTruthy();
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  act(()=>frameCallback?.(0));
  expect(screen.getByText(/A: Bestätigen/)).toBeTruthy();
  key('ArrowDown');
  expect(screen.getByText(/Enter: Bestätigen/)).toBeTruthy();
  (pad.axes as number[])[1]=-1;act(()=>frameCallback?.(0));
  expect(screen.getByText(/A: Bestätigen/)).toBeTruthy();
 });
});
