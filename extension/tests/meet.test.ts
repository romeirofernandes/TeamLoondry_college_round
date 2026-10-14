import { describe, expect, it } from 'vitest';
import { normalizeMeetPreferences, CaptionAccumulator, exportTranscript } from '../src/meet/model';
import { MeetStore } from '../src/meet/store';
describe('Meet configuration and transcript',()=>{
 it('defaults to opt-in and rejects unknown actions without touching browsing preferences',()=>{
  const p=normalizeMeetPreferences(undefined);expect(p.transcript).toBe(false);expect(p.hands).toEqual([]);expect(p.head).toEqual([]);
  expect(()=>normalizeMeetPreferences({...p,hands:[{gesture:'fist',action:'delete-account',enabled:true}]})).toThrow();
  expect(()=>normalizeMeetPreferences({...p,holdMs:NaN})).toThrow();
 });
 it('revises one provisional line and preserves legitimate repeated utterances',()=>{
  const a=new CaptionAccumulator();a.update([{id:'a',speaker:'Sam',text:'Hello'}],100);a.update([{id:'a',speaker:'Sam',text:'Hello everyone'}],200);
  expect(a.flush(500)).toEqual([]);const first=a.flush(1800);expect(first).toHaveLength(1);expect(first[0].text).toBe('Hello everyone');
  a.update([{id:'a',speaker:'Sam',text:'Hello everyone'}],1900);expect(a.flush(4000)).toEqual([]);
  a.update([],4100);a.update([{id:'b',speaker:'Sam',text:'Hello everyone'}],4200);expect(a.flush(6000)).toHaveLength(1);
 });
 it('finalizes removed lines and keeps speakers separate',()=>{
  const a=new CaptionAccumulator();a.update([{id:'a',speaker:'Sam',text:'One'},{id:'b',speaker:'Pat',text:'Two'}],100);
  const rows=a.update([],200);expect(rows.map(x=>x.speaker)).toEqual(['Sam','Pat']);
 });
 it('persists idempotent batches, rejects out of order writes and exports inert text',async()=>{
  let saved:any;const storage={get:async()=>saved,set:async(v:any)=>{saved=structuredClone(v)}};const s=new MeetStore(storage,()=>1000);
  const session=await s.start('abc-defg-hij',3,'doc',24);await s.append(session.id,1,[{text:'<script>hello</script>',speaker:'Sam',at:1000}]);
  await s.append(session.id,1,[{text:'duplicate',at:1001}]);expect((await s.get(session.id))!.lines).toHaveLength(1);
  await expect(s.append(session.id,3,[{text:'skip',at:1002}])).rejects.toThrow();
  const loaded=await new MeetStore(storage,()=>1000).get(session.id);expect(exportTranscript(loaded!)).toContain('<script>hello</script>');
  await s.end(session.id);await expect(s.append(session.id,2,[{text:'late',at:1003}])).rejects.toThrow();
 });
 it('expires stored text and never silently drops over-quota writes',async()=>{
  let clock=1000,saved:any;const s=new MeetStore({get:async()=>saved,set:async(v:any)=>{saved=structuredClone(v)}},()=>clock);
  const session=await s.start('abc-defg-hij',3,'doc',24);
  await expect(s.append(session.id,1,Array.from({length:5001},()=>({text:'x',at:1000})))).rejects.toThrow();
  clock+=25*3600000;expect(await s.list()).toEqual([]);expect(saved.sessions).toEqual([]);
 });
});
it('updates a late finalized caption revision instead of duplicating the utterance',async()=>{
 let saved:any;const s=new MeetStore({get:async()=>saved,set:async(v:any)=>{saved=structuredClone(v)}});const session=await s.start('abc-defg-hij',1,'doc',24);const a=new CaptionAccumulator();
 a.update([{id:'a',speaker:'Sam',text:'Good'}],100);await s.append(session.id,1,a.flush(1500));
 a.update([{id:'a',speaker:'Sam',text:'Good morning'}],1800);await s.append(session.id,2,a.flush(3200));
 expect((await s.get(session.id))!.lines.map(x=>x.text)).toEqual(['Good morning']);
});

it('does not write storage for read-only queries or duplicate acknowledgments',async()=>{
 let saved:any,writes=0;const store=new MeetStore({get:async()=>saved,set:async(v:any)=>{writes++;saved=structuredClone(v)}});
 expect(await store.list()).toEqual([]);expect(await store.get('missing')).toBeNull();expect(writes).toBe(0);
 const s=await store.start('abc-defg-hij',1,'doc',24);await store.append(s.id,1,[{text:'hello',at:1}]);const count=writes;
 await store.list();await store.get(s.id);await store.append(s.id,1,[{text:'hello',at:1}]);expect(writes).toBe(count);
});
