import { nativeRequest, paired } from "./desktop";
export const MAX_FILE_BYTES=20*1024*1024;
export function acceptsFile(accept:string,name:string,type:string){
 const rules=accept.toLowerCase().split(",").map(s=>s.trim()).filter(Boolean);
 return !rules.length||rules.some(rule=>rule.startsWith(".")?name.toLowerCase().endsWith(rule):rule.endsWith("/*")?type.startsWith(rule.slice(0,-1)):type===rule);
}
// These functions run in the selected document; they must be self-contained.
export function prepareUpload(token:string){
 const inputs=Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(i=>!i.disabled&&!i.webkitdirectory);
 const focused=document.activeElement;const input=inputs.includes(focused as HTMLInputElement)?focused as HTMLInputElement:inputs.length===1?inputs[0]:null;
 if(!input)throw new Error(inputs.length>1?"Focus the file upload input first; several inputs are available.":"No supported file input is available on this page.");
 input.setAttribute("data-handsfree-upload",token);return {url:location.href,origin:location.origin,accept:input.accept,token};
}
export function commitUpload(token:string,url:string,name:string,type:string,chunks:string[],size:number){
 if(location.href!==url)throw new Error("The page changed while choosing a file.");
 const input=document.querySelector<HTMLInputElement>('input[data-handsfree-upload="'+token+'"]');
 if(!input||input.type!=="file"||input.disabled||input.webkitdirectory)throw new Error("The original file input is no longer available.");
 input.removeAttribute("data-handsfree-upload");
 const rules=input.accept.toLowerCase().split(",").map(s=>s.trim()).filter(Boolean);
 if(rules.length&&!rules.some(r=>r.startsWith(".")?name.toLowerCase().endsWith(r):r.endsWith("/*")?type.startsWith(r.slice(0,-1)):type===r))throw new Error("The chosen file does not match this input's allowed file types.");
 const parts=chunks.map(c=>Uint8Array.from(atob(c),v=>v.charCodeAt(0)));if(parts.reduce((n,p)=>n+p.length,0)!==size||size>20*1024*1024)throw new Error("Incomplete or oversized file transfer.");
 const transfer=new DataTransfer();transfer.items.add(new File(parts,name,{type}));input.files=transfer.files;input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));return {name:input.files?.[0]?.name,count:input.files?.length};
}
export function clearUpload(token:string){document.querySelector('input[data-handsfree-upload="'+token+'"]')?.removeAttribute("data-handsfree-upload");}
function mime(name:string){const extension=name.toLowerCase().split(".").pop();return ({txt:"text/plain",csv:"text/csv",pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",json:"application/json",zip:"application/zip",mp4:"video/mp4",mp3:"audio/mpeg",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"} as Record<string,string>)[extension||""]||"application/octet-stream";}
export async function uploadFile(tabId:number,current:()=>boolean){
 if(!await paired())throw new Error("Connect the desktop app before attaching a file.");
 const token=crypto.randomUUID();let fileToken="";
 try{
  const prepared=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},func:prepareUpload,args:[token]});const context=prepared[0]?.result;if(!context)throw new Error("File input could not be inspected.");
  const selected=await nativeRequest<{cancelled:boolean;token:string;name:string;size:number;chunks:number}>("chooseFile",{origin:context.origin},120000);
  if(selected.cancelled)return "File selection cancelled. Nothing attached.";fileToken=selected.token;
  if(!current())throw new Error("The control session changed. Nothing attached.");
  if(!Number.isInteger(selected.size)||selected.size<0||selected.size>MAX_FILE_BYTES||selected.chunks!==Math.ceil(selected.size/(192*1024))||typeof selected.name!=="string"||!selected.name||selected.name.length>1024)throw new Error("Invalid file metadata.");
  const type=mime(selected.name);if(!acceptsFile(context.accept,selected.name,type))throw new Error("Choose a file matching this input's allowed types.");
  const chunks:string[]=[];let length=0;
  for(let index=0;index<selected.chunks;index++){if(!current())throw new Error("The session changed during transfer.");const chunk=await nativeRequest<{index:number;data:string}>("fileChunk",{token:fileToken,index});if(chunk.index!==index||typeof chunk.data!=="string"||chunk.data.length>262144)throw new Error("Invalid file chunk.");const count=atob(chunk.data).length;if(count!==Math.min(192*1024,selected.size-length))throw new Error("Incomplete file chunk.");length+=count;chunks.push(chunk.data);}
  const tab=await chrome.tabs.get(tabId);if(!current()||tab.url!==context.url)throw new Error("The tab changed. Nothing attached.");
  const committed=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},func:commitUpload,args:[token,context.url,selected.name,type,chunks,selected.size]});if(committed[0]?.result?.count!==1)throw new Error("The page did not retain the chosen file.");
  return `Attached ${selected.name}. Review it before sending; server upload success is not checked.`;
 }finally{await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},func:clearUpload,args:[token]}).catch(()=>{});if(fileToken)await nativeRequest("fileDone").catch(()=>{});}
}
