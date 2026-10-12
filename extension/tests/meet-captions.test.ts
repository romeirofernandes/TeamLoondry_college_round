// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import { MeetCaptions } from '../src/meet/captions';
afterEach(()=>{document.body.replaceChildren();vi.useRealTimers();});
it('collects only the caption region, retries the same batch and stops cleanly',async()=>{
 vi.useFakeTimers();document.body.innerHTML='<div role="region" aria-label="Captions"><div data-caption-id="a"><span data-caption-speaker>Sam</span><span data-caption-text>Hello</span></div></div><aside>Private chat</aside>';
 const batches:any[]=[];let retry=true;
 const c=new MeetCaptions('s',async batch=>{batches.push(structuredClone(batch));if(retry){retry=false;throw Error('offline')}},()=>{});
 c.start();await vi.advanceTimersByTimeAsync(1600);await vi.advanceTimersByTimeAsync(2000);
 expect(batches.length).toBeGreaterThanOrEqual(2);expect(batches[0].sequence).toBe(batches[1].sequence);expect(batches[0].lines[0].text).toBe('Hello');expect(JSON.stringify(batches)).not.toContain('Private chat');
 await c.stop();const count=batches.length;document.querySelector('[data-caption-text]')!.textContent='late';await vi.advanceTimersByTimeAsync(3000);expect(batches).toHaveLength(count);
});
it('does not mark ordinary caption silence as a gap',async()=>{
 vi.useFakeTimers();document.body.innerHTML='<div role="region" aria-label="Captions"></div>';
 const status:string[]=[];const batches:any[]=[];const c=new MeetCaptions('s',async b=>{batches.push(b)},s=>status.push(s));c.start();await vi.advanceTimersByTimeAsync(10000);expect(batches).toEqual([]);expect(status.at(-1)).toBe('capturing');await c.stop();
});

it('drains every pending batch before stopping',async()=>{
 document.body.innerHTML='<div role="region" aria-label="Captions">'+Array.from({length:201},(_,i)=>`<div data-caption-id="${i}"><span data-caption-text>line ${i}</span></div>`).join('')+'</div>';
 const batches:any[]=[];const c=new MeetCaptions('s',async b=>{batches.push(structuredClone(b));return {ok:true}},()=>{});c.start();await c.stop();
 expect(batches.flatMap(b=>b.lines)).toHaveLength(201);expect(batches.map(b=>b.sequence)).toEqual([1,2,3]);
});
it('waits for an in-flight acknowledgment and drains the final revision',async()=>{
 vi.useFakeTimers();document.body.innerHTML='<div role="region" aria-label="Captions"><div data-caption-id="a"><span data-caption-text>Hello</span></div></div>';
 let release!:()=>void;const batches:any[]=[];const c=new MeetCaptions('s',async b=>{batches.push(structuredClone(b));if(b.sequence===1)await new Promise<void>(r=>{release=r});return {ok:true}},()=>{});
 c.start();await vi.advanceTimersByTimeAsync(1600);document.querySelector('[data-caption-text]')!.textContent='Hello everyone';await Promise.resolve();
 let stopped=false;const stopping=c.stop().then(()=>{stopped=true});await Promise.resolve();expect(stopped).toBe(false);release();await stopping;expect(batches.at(-1).lines[0].text).toBe('Hello everyone');
});
