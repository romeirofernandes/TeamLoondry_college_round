import {send} from './shared';
import {exportTranscript,type MeetSession} from './meet/model';
const root=document.createElement('main');root.style.cssText='max-width:900px;margin:40px auto;padding:24px;font:18px system-ui';document.body.append(root);
const title=document.createElement('h1');title.textContent='Your Meet transcript';root.append(title);
const note=document.createElement('p');note.textContent='Stored locally by Handsfree. Google Meet captions may miss or misrecognise speech.';root.append(note);
void(async()=>{
 const id=new URL(location.href).searchParams.get('id');if(!id)throw new Error('No transcript selected.');
 const session=await send<MeetSession|null>({type:'MEET_TRANSCRIPT_READ',id});if(!session)throw new Error('This transcript has expired or was deleted.');
 const text=exportTranscript(session),button=document.createElement('button');button.type='button';button.textContent='Download .txt';button.style.cssText='font:inherit;padding:16px';
 button.onclick=()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`handsfree-meet-${new Date(session.startedAt).toISOString().slice(0,10)}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};root.append(button);
 const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';pre.textContent=text;root.append(pre);
})().catch(error=>{note.textContent=error instanceof Error?error.message:'Transcript unavailable.';});
