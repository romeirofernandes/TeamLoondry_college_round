// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ContentRuntime} from '../src/content/runtime';
import {defaults,type Message} from '../src/shared';
let runtime:ContentRuntime;let sent:Message[]=[];let acknowledge:(value:unknown)=>void;
beforeEach(async()=>{
 document.body.innerHTML='<form><input type="password"><button>Submit</button></form>';
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({x:0,y:0,left:0,top:0,width:100,height:40,right:100,bottom:40,toJSON(){}});
 sent=[];runtime=new ContentRuntime(async message=>{sent.push(message);if(message.type==='PRIVATE_INPUT')return new Promise(r=>acknowledge=r);return {ok:true};},()=>0,false);
 await runtime.handle({type:'PAGE_STATE',running:true,paused:false,dictating:false,settings:defaults});
});
afterEach(()=>{runtime.destroy();vi.restoreAllMocks();});
it('focus latches privacy before awaiting microphone acknowledgement and blocks page data/actions',async()=>{
 document.querySelector('input')!.focus();
 expect(sent).toContainEqual({type:'PRIVATE_INPUT',command:'enter'});
 expect(await runtime.handle({type:'GET_TARGETS'})).toEqual([]);
 expect(await runtime.handle({type:'GET_PAGE_CONTEXT'})).toBeNull();
 expect(await runtime.handle({type:'PAGE_ACTION',intent:{type:'click'}})).toMatchObject({ok:false});
 acknowledge({ok:true,privateInput:true});await Promise.resolve();
 expect(document.querySelector('#handsfree-private-input')?.shadowRoot).toBeNull();
 expect(sent.every(m=>!JSON.stringify(m).includes('password-value'))).toBe(true);
});

it('disables Reading controls before private acknowledgement and keeps them disabled',async()=>{
 await runtime.handle({type:'PAGE_STATE',activityMode:'reading',running:true,paused:false,dictating:false,settings:defaults});
 const toolbar=document.querySelector('[aria-label="Reading controls"]') as HTMLElement;
 expect(toolbar.hidden).toBe(false);
 document.querySelector('input')!.focus();
 expect(toolbar.hidden).toBe(true);
 await runtime.handle({type:'PAGE_STATE',activityMode:'reading',privateInput:true,running:true,paused:false,dictating:false,settings:defaults});
 expect(toolbar.hidden).toBe(true);
});
