import {meetingCode,type CaptionLine,type MeetSession} from './model';
import {MeetStore} from './store';
interface Environment{allowed():boolean;tab(id:number):Promise<{url?:string}>;page(id:number,message:any):Promise<any>}
export class MeetService {
 private active:MeetSession|null=null;private sourceState='stopped';private error='';private epoch=0;
 constructor(readonly store:MeetStore,private env:Environment){}
 async restore(){
  const sessions=await this.store.list();
  for(const summary of sessions.filter(s=>s.endedAt===undefined)){
    let valid=false;
    if(!this.active&&this.env.allowed())try{const tab=await this.env.tab(summary.tabId),page=await this.env.page(summary.tabId,{type:'MEET_PAGE_STATUS'});valid=meetingCode(tab.url||'')===summary.code&&page?.active&&page.documentId===summary.documentId&&page.sessionId===summary.id;}catch{}
    if(valid){this.active=await this.store.get(summary.id);this.sourceState='waiting for captions';}
    else await this.store.end(summary.id);
  }
 }
 async status(){return {active:this.active?{id:this.active.id,tabId:this.active.tabId,code:this.active.code}:null,capture:this.sourceState,error:this.error,sessions:await this.store.list(),signing:{ready:false,reason:'No verified local ISL/ASL motion pack is installed.'}};}
 async start(tabId:number,retention:0|24|168){
  if(!this.env.allowed())throw new Error('Start Handsfree and finish private entry before capturing captions.');
  const token=++this.epoch;
  if(this.active)await this.endActive(true);
  const tab=await this.env.tab(tabId),code=meetingCode(tab.url||'');if(!code)throw new Error('Open an active Google Meet call first.');
  const page=await this.env.page(tabId,{type:'MEET_PAGE_STATUS'});
  if(!page?.active||page.code!==code||typeof page.documentId!=='string')throw new Error('Join the meeting before starting its transcript.');
  if(token!==this.epoch||!this.env.allowed())throw new Error('Meet capture was cancelled.');
  const session=await this.store.start(code,tabId,page.documentId,retention);
  if(token!==this.epoch||!this.env.allowed()){await this.store.end(session.id);throw new Error('Meet capture was cancelled.');}
  this.active=session;this.sourceState='waiting for captions';this.error='';
  try{const response=await this.env.page(tabId,{type:'MEET_CAPTURE',sessionId:session.id,command:'start',documentId:session.documentId});if(response?.ok!==true)throw new Error('Meet caption observer could not start.');if(token!==this.epoch||this.active!==session||!this.env.allowed())throw new Error('Meet capture was cancelled.');}
  catch(error){if(this.active===session)await this.endActive(false);throw error;}
  return session;
 }
 async caption(tabId:number,documentId:string,id:string,sequence:number,lines:CaptionLine[],status?:string){
  const s=this.active;if(!this.env.allowed()||!s||s.id!==id||s.tabId!==tabId||s.documentId!==documentId)throw new Error('Stale or inactive Meet caption source.');
  if(meetingCode((await this.env.tab(tabId)).url||'')!==s.code||this.active!==s||!this.env.allowed())throw new Error('Meeting changed.');
  if(lines.length)try{await this.store.append(id,sequence,lines);}catch(error){this.error=error instanceof Error?error.message:'Transcript storage failed.';throw error;}
  if(status==='capturing'||status==='waiting for captions')this.sourceState=status;
 }
 private async endActive(flush:boolean){const s=this.active;if(!s)return;
  if(flush){const result=await this.env.page(s.tabId,{type:'MEET_CAPTURE',sessionId:s.id,documentId:s.documentId,command:'stop'});if(result?.ok!==true){this.error=result?.error||'The final caption batch could not be saved. Retry Stop or download the saved portion.';throw new Error(this.error);}}
  if(this.active===s){this.active=null;this.sourceState='stopped';await this.store.end(s.id);}
  if(!flush)await this.env.page(s.tabId,{type:'MEET_CAPTURE',sessionId:s.id,documentId:s.documentId,command:'cancel'}).catch(()=>{});
 }
 async stopAll(){++this.epoch;await this.endActive(false);}
 async stop(){++this.epoch;await this.endActive(true);}
 async tabClosed(tabId:number){if(this.active?.tabId===tabId)await this.stopAll();}
 async delete(id:string){if(this.active?.id===id)await this.stopAll();await this.store.delete(id);}
}
