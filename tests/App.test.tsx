import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,cleanup,act} from '@testing-library/react';
import {App} from '../src/App';
const narrator=vi.hoisted(()=>({play:vi.fn(),stop:vi.fn(),enabled:true}));
vi.mock('../src/audio',()=>({
 Narrator:class {get enabled(){return narrator.enabled;}set enabled(v:boolean){narrator.enabled=v;}
  play(cues:unknown[],done?:()=>void){narrator.play(cues,done);}
  stop(){narrator.stop();}}
}));
let pad:Gamepad|null=null;
let frameCallback:FrameRequestCallback|undefined;
function key(k:string){fireEvent.keyDown(window,{key:k});}
function click(label:RegExp|string){fireEvent.click(screen.getByRole('button',{name:label}));}
function tickPad(button:number){
 if(!pad)throw Error('No controller');
 (pad.buttons as GamepadButton[])[button]={pressed:true,touched:true,value:1};
 act(()=>frameCallback?.(0));
 (pad.buttons as GamepadButton[])[button]={pressed:false,touched:false,value:0};
 act(()=>frameCallback?.(0));
}
beforeEach(()=>{
 narrator.play.mockReset();narrator.stop.mockReset();narrator.enabled=true;
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
  key('Escape');click(/Spiel starten/);
  expect(screen.getByText('Frage 1 von 20')).toBeTruthy();
 });
 it('runs question, repeat, feedback and next-question flow',()=>{
  render(<App/>);click(/Spiel starten/);
  expect(screen.getAllByRole('button').length).toBeGreaterThan(4);
  key('r');
  expect(narrator.play).toHaveBeenCalledTimes(2);
  const options=screen.getAllByRole('button').filter(b=>b.classList.contains('answer'));
  fireEvent.click(options[0]);
  expect(screen.getByText(/RICHTIG!|NICHT GANZ!/)).toBeTruthy();
  key('Enter');
  expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
 it('handles pause, replay and resume through header button',()=>{
  render(<App/>);click(/Spiel starten/);
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
  render(<App/>);click('⚙ Einstellungen');click('5');click(/Zurück zum Menü/);click(/Spiel starten/);
  for(let i=0;i<5;i++){
   const buttons=screen.getAllByRole('button').filter(b=>b.classList.contains('answer'));
   fireEvent.click(buttons[i%4]);
   key('Enter');
  }
  expect(screen.getByText('Das war Quiz-Krawall!')).toBeTruthy();
  click(/Nochmal spielen/);
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
  tickPad(1);tickPad(9);
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  tickPad(5);
  expect(narrator.play.mock.calls.length).toBeGreaterThan(1);
  tickPad(9);expect(screen.getByText('Pause')).toBeTruthy();
  tickPad(0);expect(screen.queryByText('Pause')).toBeNull();
  pad=null;act(()=>frameCallback?.(0));
  expect(screen.getByText(/Controller getrennt/)).toBeTruthy();
 });
 it('does not answer twice and handles start and back navigation',()=>{
  render(<App/>);key('Enter');
  key('x');const first=screen.getByText(/RICHTIG!|NICHT GANZ!/).textContent;
  key('y');expect(screen.getByText(/RICHTIG!|NICHT GANZ!/).textContent).toBe(first);
  key('Escape');expect(screen.getByText('Pause')).toBeTruthy();
  click(/Weiterspielen/);expect(screen.queryByText('Pause')).toBeNull();
  key('Enter');expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
});


describe('additional controller and audio transitions',()=>{
 it('waits for spoken feedback before automatically advancing',()=>{
  vi.useFakeTimers();
  render(<App/>);click(/Spiel starten/);key('x');
  const call=narrator.play.mock.calls.at(-1);
  expect(call?.[1]).toBeTypeOf('function');
  act(()=>call?.[1]?.());
  act(()=>vi.advanceTimersByTime(950));
  expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
 it('supports spoken feedback replay during and after pause',()=>{
  render(<App/>);click(/Spiel starten/);
  key('x');const plays=narrator.play.mock.calls.length;
  key('r');expect(narrator.play.mock.calls.length).toBeGreaterThan(plays);
  key('Escape');expect(screen.getByText('Pause')).toBeTruthy();
  click(/Frage wiederholen/);expect(screen.queryByText('Pause')).toBeNull();
  expect(narrator.play.mock.calls.length).toBeGreaterThan(plays+1);
 });
 it('returns from settings with Start and repeats with R1 on gamepad',()=>{
  render(<App/>);click('⚙ Einstellungen');
  key('Escape');click(/Spiel starten/);key('Escape');
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
  tickPad(9);
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  tickPad(2);
  expect(screen.getByText(/RICHTIG!|NICHT GANZ!/)).toBeTruthy();
  tickPad(0);
  expect(screen.getByText('Frage 2 von 10')).toBeTruthy();
 });
 it('allows controller A to start, D-pad to choose and B to return',()=>{
  pad={index:0,buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],id:'Xbox',connected:true,mapping:'standard',timestamp:0} as unknown as Gamepad;
  render(<App/>);
  act(()=>frameCallback?.(0));tickPad(0);
  expect(screen.getByText('Frage 1 von 10')).toBeTruthy();
  tickPad(1);
  expect(screen.getByText('Pause')).toBeTruthy();
  tickPad(1);
  expect(screen.queryByText('Pause')).toBeNull();
 });
});
