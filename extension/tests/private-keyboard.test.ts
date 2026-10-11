// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PrivateKeyboard } from '../src/content/private-keyboard';
let keyboard: PrivateKeyboard;
let field: HTMLInputElement;
beforeEach(() => {
  document.body.innerHTML = '<form><input type="password"><button>Submit</button></form>';
  field = document.querySelector('input')!;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({width:100,height:40,top:0,left:0,right:100,bottom:40,x:0,y:0,toJSON(){}});
  keyboard = new PrivateKeyboard(() => {}, () => {}, () => {});
});
afterEach(() => { keyboard.destroy(); vi.restoreAllMocks(); });
it('requires microphone acknowledgement and never submits or reveals a password', () => {
  const submit = vi.fn(); field.form!.addEventListener('submit', submit);
  expect(keyboard.open(field)).toBe(true);
  keyboard.press('a'); expect(field.value).toBe('');
  keyboard.ready(true); keyboard.press('a'); keyboard.press('Shift'); keyboard.press('b');
  expect(field.value).toBe('aB'); expect(field.type).toBe('password');
  expect(document.body.textContent).not.toContain('aB');
  keyboard.press('Done'); expect(field.value).toBe('aB'); expect(submit).not.toHaveBeenCalled();
});
it('edits selection with no character in dispatched event data', () => {
  keyboard.open(field); keyboard.ready(true); field.value='abc'; field.setSelectionRange(1,2);
  const events: unknown[]=[];field.addEventListener('input', e=>events.push((e as InputEvent).data));
  keyboard.press('z');expect(field.value).toBe('azc');expect(events).toEqual([null]);
  keyboard.press('Backspace');expect(field.value).toBe('ac');keyboard.press('Clear');expect(field.value).toBe('');
});
it('invalidates a replaced field and never edits its replacement', () => {
  keyboard.open(field); keyboard.ready(true); const other=field.cloneNode() as HTMLInputElement;field.replaceWith(other);
  keyboard.press('a');expect(other.value).toBe('');expect(keyboard.valid()).toBe(false);
});
it('invalidates form action and readonly changes', () => {
  keyboard.open(field);keyboard.ready(true);field.form!.action='/other';keyboard.press('a');expect(field.value).toBe('');
  keyboard.open(field);keyboard.ready(true);field.readOnly=true;keyboard.press('a');expect(field.value).toBe('');
});
it('rejects non-password inputs and close retains the entered value', () => {
  field.type='text';expect(keyboard.open(field)).toBe(false);field.type='password';
  keyboard.open(field);keyboard.ready(true);keyboard.press('x');keyboard.press('Close');expect(field.value).toBe('x');expect(keyboard.active).toBe(false);
});
it('rejects hidden, insecure and non-password fields',()=>{
 vi.stubGlobal('location',{protocol:'http:',hostname:'example.test',href:'http://example.test/'});
 expect(keyboard.open(field)).toBe(false);vi.unstubAllGlobals();
 field.style.opacity='0';expect(keyboard.open(field)).toBe(false);
});
it('invalidates same-origin navigation and a blocking modal',()=>{
 keyboard.open(field);keyboard.ready(true);history.replaceState({},'', '/changed');keyboard.press('a');expect(field.value).toBe('');history.replaceState({},'', '/');
 keyboard.open(field);keyboard.ready(true);document.body.insertAdjacentHTML('beforeend','<dialog open>Unrelated dialog</dialog>');keyboard.press('a');expect(field.value).toBe('');
});
it('destroy clears the binding and re-opening still waits for microphone acknowledgement',()=>{
 keyboard.open(field);keyboard.ready(true);keyboard.destroy();expect(keyboard.active).toBe(false);keyboard.open(field);keyboard.press('a');expect(field.value).toBe('');
});
