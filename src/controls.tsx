export type InputDevice='keyboard'|'gamepad';
export type ControlAction='confirm'|'back'|'repeat'|'pause'|'answer-X'|'answer-Y'|'answer-B'|'answer-A';
const shortcuts:Record<ControlAction,{keyboard:string;gamepad:string}>={
 confirm:{keyboard:'Enter',gamepad:'A'},
 back:{keyboard:'Esc',gamepad:'B'},
 repeat:{keyboard:'R',gamepad:'R1'},
 pause:{keyboard:'Esc',gamepad:'Start'},
 'answer-X':{keyboard:'1',gamepad:'X'},
 'answer-Y':{keyboard:'2',gamepad:'Y'},
 'answer-B':{keyboard:'3',gamepad:'B'},
 'answer-A':{keyboard:'4',gamepad:'A'}
};
export function shortcut(action:ControlAction,device:InputDevice):string{
 return shortcuts[action][device];
}
export function ControlHint({action,device}:{action:ControlAction;device:InputDevice}){
 const key=shortcut(action,device);
 return <span className={'pad-badge pad-badge--'+(device==='gamepad'?key.toLowerCase():'keyboard')} aria-hidden="true">{key}</span>;
}
export function NavigationHint({device,back=true}:{device:InputDevice;back?:boolean}){
 return <span className="helper">{
  device==='gamepad'
   ? 'Steuerkreuz: Auswahl · A: Bestätigen'+(back?' · B: Zurück':'')
   : 'Pfeiltasten: Auswahl · Enter: Bestätigen'+(back?' · Esc: Zurück':'')
 }</span>;
}
