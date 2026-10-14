import { CaptionAccumulator, type CaptionLine, type CaptionInput } from './model';
export interface CaptionBatch {sessionId:string;sequence:number;lines:CaptionLine[]}
export class MeetCaptions {
 private accumulator=new CaptionAccumulator();private observer:MutationObserver|null=null;private timer:ReturnType<typeof setInterval>|null=null;
 private ids=new WeakMap<Element,string>();private nextId=0;private pending:CaptionLine[]=[];private batch:CaptionBatch|null=null;private sequence=0;private inFlight:Promise<boolean>|null=null;private active=false;private previousStatus='';private gap=false;
 constructor(private sessionId:string,private send:(batch:CaptionBatch)=>Promise<unknown>,private status:(value:string)=>void){}
 start(){if(this.active)return;this.active=true;this.observer=new MutationObserver(()=>this.scan());this.observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','hidden','style','data-caption-id']});this.timer=setInterval(()=>{this.scan();this.pending.push(...this.accumulator.flush(Date.now()));void this.deliver();},400);this.scan();}
 private scan(){if(!this.active)return;
  const root=Array.from(document.querySelectorAll('[role="region"][aria-label],[aria-live][aria-label],[data-caption-region]')).find(e=>e.hasAttribute('data-caption-region')||/^(?:closed )?captions(?:\b|$)/i.test(e.getAttribute('aria-label')||''));
  const available=!!root&&!root.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(root).display!=='none';
  const next=available?'capturing':'waiting for captions';
  if(next!==this.previousStatus){if(this.previousStatus==='capturing'&&!available){this.gap=true;this.pending.push(...this.accumulator.flush(Date.now(),true));this.pending.push({kind:'gap',text:'Caption source became unavailable.',at:Date.now()});}else if(available&&this.gap){this.pending.push({kind:'gap',text:'Caption source resumed.',at:Date.now()});this.gap=false;}this.previousStatus=next;this.status(next);}
  if(!available)return;
  const rows=Array.from(root.querySelectorAll('[data-caption-id],[data-caption-row],.TBMuR'));
  const input:CaptionInput[]=rows.map(row=>{
   let id=row.getAttribute('data-caption-id')||this.ids.get(row);if(!id){id=String(++this.nextId);this.ids.set(row,id);}
   const speaker=row.querySelector('[data-caption-speaker],.NWpY1d')?.textContent?.trim().slice(0,120);
   const text=row.querySelector('[data-caption-text],.bh44bd')?.textContent?.trim()||'';
   return {id,speaker,text:text.slice(0,5000)};
  }).filter(x=>x.text);
  this.pending.push(...this.accumulator.update(input,Date.now()));void this.deliver();
 }
 private deliver():Promise<boolean>{
  if(this.inFlight)return this.inFlight;
  if(!this.batch&&!this.pending.length)return Promise.resolve(true);
  if(!this.batch)this.batch={sessionId:this.sessionId,sequence:this.sequence+1,lines:this.pending.splice(0,100)};
  const batch=this.batch;
  this.inFlight=(async()=>{
   try{const result=await this.send(batch);if((result as any)?.ok===false)throw new Error((result as any).error||'Transcript storage failed.');
    if(this.batch!==batch)return false;this.sequence=batch.sequence;this.batch=null;return true;
   }catch(error){this.status(error instanceof Error?error.message:'Transcript storage interrupted.');return false;}
   finally{this.inFlight=null;}
  })();return this.inFlight;
 }
 async stop(flush=true){
  if(flush)this.scan();
  this.active=false;this.observer?.disconnect();this.observer=null;if(this.timer)clearInterval(this.timer);this.timer=null;
  if(!flush){this.pending=[];this.batch=null;return;}
  this.pending.push(...this.accumulator.flush(Date.now(),true));
  if(this.inFlight&&!await this.inFlight)throw new Error('Transcript storage interrupted. The final batch was not acknowledged.');
  while(this.batch||this.pending.length){if(!await this.deliver())throw new Error('Transcript storage interrupted. The final batch was not acknowledged.');}
 }
}
