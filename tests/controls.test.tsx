import {describe,it,expect} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {ControlHint,NavigationHint,shortcut,type ControlAction} from '../src/controls';
describe('control labels',()=>{
 it('maps each action to keyboard and controller labels',()=>{
  const expected:[ControlAction,string,string][]=[
   ['confirm','Enter','A'],['back','Esc','B'],['repeat','R','R1'],['pause','Esc','Start'],
   ['answer-X','1','X'],['answer-Y','2','Y'],['answer-B','3','B'],['answer-A','4','A']
  ];
  for(const [action,keyboard,gamepad] of expected){
   expect(shortcut(action,'keyboard')).toBe(keyboard);
   expect(shortcut(action,'gamepad')).toBe(gamepad);
  }
 });
 it('renders distinct visually styled but accessibility-neutral keyboard and controller badges',()=>{
  render(<ControlHint action="repeat" device="keyboard"/>);
  expect(screen.getByText('R').getAttribute('aria-hidden')).toBe('true');
  expect(screen.getByText('R').className).toContain('pad-badge--keyboard');
  cleanup();
  render(<ControlHint action="repeat" device="gamepad"/>);
  expect(screen.getByText('R1').className).toContain('pad-badge--r1');
 });
 it('renders the correct instructions with or without a back action',()=>{
  render(<NavigationHint device="keyboard"/>);
  expect(screen.getByText(/Esc: Zurück/)).toBeTruthy();
  cleanup();
  render(<NavigationHint device="gamepad" back={false}/>);
  const hint=screen.getByText(/A: Bestätigen/);
  expect(hint.textContent).not.toContain('B: Zurück');
 });
});
