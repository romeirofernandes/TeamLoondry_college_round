import type { CaptionLine, MeetSession, MeetSessionSummary } from './model';
interface Storage {get():Promise<unknown>;set(value:unknown):Promise<void>}
interface Data {version:1;sessions:MeetSession[]}
export class MeetStore {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private storage:Storage,private now=()=>Date.now()){}
 private transaction<T>(fn:(data:Data)=>T|Promise<T>):Promise<T>{const work=this.queue.catch(()=>{}).then(async()=>{
  const saved=await this.storage.get() as Data|undefined;
  const data:Data={version:1,sessions:Array.isArray(saved?.sessions)?structuredClone(saved.sessions).filter(s=>s.expiresAt>this.now()):[]};
  const before=JSON.stringify(saved?.sessions || []);
  const result=await fn(data);if(before!==JSON.stringify(data.sessions))await this.storage.set(data);return result;
 });this.queue=work;return work;}
 start(code:string,tabId:number,documentId:string,retentionHours:0|24|168):Promise<MeetSession>{return this.transaction(data=>{
  if(!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code)||!Number.isInteger(tabId)||!documentId||documentId.length>100)throw new Error('Invalid meeting identity.');
  const now=this.now();const session:MeetSession={id:crypto.randomUUID(),code,tabId,documentId,startedAt:now,expiresAt:retentionHours===0?Number.MAX_SAFE_INTEGER:now+retentionHours*3600000,sequence:0,lines:[]};
  // Keep at most three calls; never evict a live call.
  if(data.sessions.length>=3){const i=data.sessions.findIndex(s=>s.endedAt!==undefined);if(i<0)throw new Error('Stop an existing transcript before starting another.');data.sessions.splice(i,1);}
  data.sessions.push(session);return structuredClone(session);
 });}
 append(id:string,sequence:number,lines:CaptionLine[]):Promise<void>{return this.transaction(data=>{
  const s=data.sessions.find(x=>x.id===id);if(!s||s.endedAt!==undefined)throw new Error('This transcript session has ended.');
  if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error('Invalid caption sequence.');if(sequence<=s.sequence)return;
  if(sequence!==s.sequence+1)throw new Error('Caption sequence interrupted. Retry the pending batch.');
  if(!Array.isArray(lines)||!lines.length||lines.length>5000||lines.some(x=>!x||typeof x.text!=='string'||!x.text.trim()||x.text.length>5000||!Number.isFinite(x.at)||(x.speaker!==undefined&&(typeof x.speaker!=='string'||x.speaker.length>120))||(x.sourceId!==undefined&&(typeof x.sourceId!=='string'||x.sourceId.length>150))||(x.kind!==undefined&&!['caption','gap'].includes(x.kind))))throw new Error('Invalid caption batch.');
  const next=structuredClone(s.lines);
  for(const x of lines){const row={sourceId:x.sourceId,text:x.text,speaker:x.speaker,at:x.at,kind:x.kind};const index=x.sourceId?next.findIndex(prior=>prior.sourceId===x.sourceId):-1;if(index>=0)next[index]=row;else next.push(row);}
  if(next.length>5000||new TextEncoder().encode(JSON.stringify({...data,sessions:data.sessions.map(x=>x.id===id?{...x,lines:next}:x)})).length>2000000)throw new Error('Local transcript limit reached. Download and delete a transcript.');
  s.lines=next;s.sequence=sequence;
 });}
 end(id:string):Promise<void>{return this.transaction(data=>{const s=data.sessions.find(x=>x.id===id);if(s&&!s.endedAt){s.endedAt=this.now();if(s.expiresAt===Number.MAX_SAFE_INTEGER)data.sessions=data.sessions.filter(x=>x.id!==id);}});}
 get(id:string):Promise<MeetSession|null>{return this.transaction(data=>structuredClone(data.sessions.find(x=>x.id===id)||null));}
 list():Promise<MeetSessionSummary[]>{return this.transaction(data=>data.sessions.map(({lines,...s})=>({...s,lineCount:lines.length})).reverse());}
 delete(id:string):Promise<void>{return this.transaction(data=>{data.sessions=data.sessions.filter(x=>x.id!==id);});}
}
