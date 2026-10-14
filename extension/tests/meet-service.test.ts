import {it,expect} from 'vitest';
import {MeetService} from '../src/meet/service';
import {MeetStore} from '../src/meet/store';
it('binds caption writes to one document and keeps text out of aggregate status',async()=>{
 let saved:any;const store=new MeetStore({get:async()=>saved,set:async x=>{saved=structuredClone(x)}});
 let privateInput=false;
 const service=new MeetService(store,{allowed:()=>!privateInput,tab:async()=>({url:'https://meet.google.com/abc-defg-hij'}),page:async(_id,m:any)=>m.type==='MEET_PAGE_STATUS'?{code:'abc-defg-hij',documentId:'doc',active:true}:{ok:true}});
 const s=await service.start(1,24);
 await expect(service.caption(1,'wrong',s.id,1,[{text:'secret meeting',at:Date.now()}])).rejects.toThrow();
 await service.caption(1,'doc',s.id,1,[{text:'secret meeting',at:Date.now()}]);expect(JSON.stringify(await service.status())).not.toContain('secret meeting');
 privateInput=true;await expect(service.caption(1,'doc',s.id,2,[{text:'private',at:Date.now()}])).rejects.toThrow();
 await service.stopAll();expect((await store.get(s.id))!.endedAt).toBeDefined();
});
it('restores a live caption session after worker suspension and ends stale sources',async()=>{
 let saved:any;const storage={get:async()=>saved,set:async(x:any)=>{saved=structuredClone(x)}};const store=new MeetStore(storage);
 const env={allowed:()=>true,tab:async()=>({url:'https://meet.google.com/abc-defg-hij'}),page:async(_id:number,m:any):Promise<any>=>m.type==='MEET_PAGE_STATUS'?{code:'abc-defg-hij',documentId:'doc',active:true,sessionId:id}:{ok:true}};
 let id:string|undefined;const first=new MeetService(store,env);id=(await first.start(1,24)).id;
 const second=new MeetService(new MeetStore(storage),env);await second.restore();await second.caption(1,'doc',id,1,[{text:'restored',at:Date.now()}]);
 expect((await store.get(id))!.lines).toHaveLength(1);
 env.page=async()=>({active:false});const third=new MeetService(new MeetStore(storage),env);await third.restore();expect((await store.get(id))!.endedAt).toBeDefined();
});
it('reports a failed final storage acknowledgment rather than claiming a complete transcript',async()=>{
 let saved:any;const store=new MeetStore({get:async()=>saved,set:async(v:any)=>{saved=structuredClone(v)}});
 const service=new MeetService(store,{allowed:()=>true,tab:async()=>({url:'https://meet.google.com/abc-defg-hij'}),page:async(_id,m:any)=>m.type==='MEET_PAGE_STATUS'?{code:'abc-defg-hij',documentId:'doc',active:true}:m.command==='stop'?{ok:false,error:'Disk full'}:{ok:true}});
 await service.start(1,24);await expect(service.stop()).rejects.toThrow('Disk full');expect((await service.status()).active).not.toBeNull();await service.stopAll();
});
