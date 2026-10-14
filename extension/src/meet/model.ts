import type { HandGesture } from '../shared';
export const meetActions = ['mute','unmute','camera-on','camera-off','captions-on','captions-off','hand-up','hand-down','open-chat','open-people','leave'] as const;
export type MeetAction = typeof meetActions[number];
export type HeadGesture = 'lean-left'|'lean-right'|'look-up'|'look-down';
export interface MeetMapping { gesture: HandGesture|HeadGesture; action: MeetAction; enabled: boolean; threshold: number; calibratedAt: number; neutral?:number; direction?:1|-1 }
export interface MeetPreferences { version:1; voice:boolean; face:boolean; hand:boolean; holdMs:number; cooldownMs:number; hands:MeetMapping[]; head:MeetMapping[]; transcript:boolean; retentionHours:0|24|168; signing:boolean; signingLanguage:'isl'|'asl' }
export const defaultMeetPreferences: MeetPreferences={version:1,voice:true,face:true,hand:true,holdMs:700,cooldownMs:1200,hands:[],head:[],transcript:false,retentionHours:24,signing:false,signingLanguage:'isl'};
export function normalizeMeetPreferences(value:unknown):MeetPreferences {
 if(value==null)return structuredClone(defaultMeetPreferences);
 if(typeof value!=='object'||Array.isArray(value))throw new Error('Invalid Meet preferences.');
 const p={...defaultMeetPreferences,...value} as MeetPreferences;
 for(const k of ['voice','face','hand','transcript','signing'] as const)if(typeof p[k]!=='boolean')throw new Error('Invalid Meet switch.');
 if(p.version!==1||![0,24,168].includes(p.retentionHours)||!['isl','asl'].includes(p.signingLanguage))throw new Error('Unsupported Meet settings.');
 if(!Number.isFinite(p.holdMs)||p.holdMs<400||p.holdMs>3000||!Number.isFinite(p.cooldownMs)||p.cooldownMs<500||p.cooldownMs>5000)throw new Error('Meet timing is out of range.');
 const mappings=(items:MeetMapping[],allowed:string[])=>{
  if(!Array.isArray(items)||items.length>allowed.length)throw new Error('Invalid Meet mappings.');
  const seen=new Set<string>();return items.map(m=>{
   if(!m||!allowed.includes(m.gesture)||!meetActions.includes(m.action)||typeof m.enabled!=='boolean'||!Number.isFinite(m.threshold)||m.threshold<0.1||m.threshold>1||!Number.isFinite(m.calibratedAt)||m.calibratedAt<=0||seen.has(m.gesture))throw new Error('Invalid or duplicate Meet gesture. Calibrate it first.');
   if(allowed[0]==='lean-left'&&(!Number.isFinite(m.neutral)||Math.abs(m.neutral!)>3.2||![1,-1].includes(m.direction!)))throw new Error('Calibrate the comfortable head direction first.');
   seen.add(m.gesture);return {gesture:m.gesture,action:m.action,enabled:m.enabled,threshold:m.threshold,calibratedAt:m.calibratedAt,...(allowed[0]==='lean-left'?{neutral:m.neutral,direction:m.direction}:{})};
  });
 };
 return {version:1,voice:p.voice,face:p.face,hand:p.hand,holdMs:p.holdMs,cooldownMs:p.cooldownMs,hands:mappings(p.hands,['index','two-fingers','three-fingers','fist','thumbs-up']),head:mappings(p.head,['lean-left','lean-right','look-up','look-down']),transcript:p.transcript,retentionHours:p.retentionHours,signing:p.signing,signingLanguage:p.signingLanguage};
}
export interface CaptionLine {sourceId?:string;text:string;speaker?:string;at:number;kind?:'caption'|'gap'}
export interface CaptionInput {id:string;speaker?:string;text:string}
export interface MeetSession {id:string;code:string;tabId:number;documentId:string;startedAt:number;endedAt?:number;expiresAt:number;sequence:number;lines:CaptionLine[]}
export type MeetSessionSummary=Omit<MeetSession,'lines'> & {lineCount:number};
/** Keep revisions provisional; a visible unchanged finalized row is never appended twice. */
export class CaptionAccumulator {
 private rows=new Map<string,{value:CaptionInput;first:number;changed:number;emitted:string|null}>();
 update(input:CaptionInput[],now:number):CaptionLine[]{
  const present=new Set(input.map(x=>x.id));const out:CaptionLine[]=[];
  for(const [id,row]of this.rows)if(!present.has(id)){if(row.emitted!==row.value.text&&row.value.text.trim())out.push({sourceId:row.value.id+":"+row.first,text:row.value.text,speaker:row.value.speaker,at:row.first});this.rows.delete(id);}
  for(const value of input){const prior=this.rows.get(value.id);if(!prior)this.rows.set(value.id,{value:{...value},first:now,changed:now,emitted:null});else if(prior.value.text!==value.text||prior.value.speaker!==value.speaker){prior.value={...value};prior.changed=now;}}
  return out;
 }
 flush(now:number,force=false):CaptionLine[]{const out:CaptionLine[]=[];for(const row of this.rows.values())if(row.value.text.trim()&&row.emitted!==row.value.text&&(force||now-row.changed>=1200)){out.push({sourceId:row.value.id+":"+row.first,text:row.value.text,speaker:row.value.speaker,at:row.first});row.emitted=row.value.text;}return out;}
}
export function exportTranscript(session:MeetSession):string {
 const header=`Handsfree meeting transcript\nSource: Google Meet captions (may be incomplete)\nStarted: ${new Date(session.startedAt).toLocaleString()}\n\n`;
 return header+session.lines.map(row=>`[${new Date(row.at).toLocaleTimeString()}] ${row.kind==='gap'?'[Capture gap]':row.speaker||'Speaker unknown'}: ${row.text}`).join('\n');
}
export function meetingCode(url:string):string|null{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='meet.google.com'&&/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(u.pathname)?u.pathname.split('/')[1]:null;}catch{return null;}}
