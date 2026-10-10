/** Pairing is opt-in. A paired but unreachable app fails closed. */
let port:chrome.runtime.Port|null=null,owned=false,heartbeat:ReturnType<typeof setInterval>|null=null;
let choosing=false;
let connection:Promise<void>|null=null;
const pending=new Map<string,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
let lost:()=>void=()=>{};
export function onDesktopLost(callback:()=>void){lost=callback;}
export async function paired(){return (await chrome.storage.local.get("desktopPaired")).desktopPaired===true;}
function disconnected(){port=null;connection=null;const wasOwned=owned;owned=false;if(heartbeat)clearInterval(heartbeat);heartbeat=null;for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error("Desktop disconnected. Open Handsfree and reconnect."));}pending.clear();if(wasOwned)lost();}
export function nativeRequest<T=any>(type:string,args:Record<string,unknown>={},timeout=10000):Promise<T>{
 if(!port)return Promise.reject(new Error("Open Handsfree and choose Connect desktop first."));
 if(type==="chooseFile")choosing=true;
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error("Desktop request timed out. Nothing was attached."));},timeout);pending.set(id,{resolve,reject,timer});try{port!.postMessage({id,type,...args});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}}).finally(()=>{if(type==="chooseFile")choosing=false;}) as Promise<T>;
}
async function connect(){
 if(connection)return connection;
 connection=(async()=>{port=chrome.runtime.connectNative("com.handsfree.desktop");port.onDisconnect.addListener(()=>{void chrome.runtime.lastError;disconnected();});port.onMessage.addListener(response=>{const item=pending.get(response?.id);if(!item)return;pending.delete(response.id);clearTimeout(item.timer);if(response.ok)item.resolve(response.result);else item.reject(new Error(response.error||"Desktop request failed"));});const hello=await nativeRequest<{protocol:number}>("hello");if(hello.protocol!==1)throw new Error("Update the desktop app and extension together.");})();
 try{await connection;}catch(e){port?.disconnect();disconnected();throw e;}
}
export async function connectDesktop(){await connect();await chrome.storage.local.set({desktopPaired:true});return {ok:true};}
export async function claimDesktop(){if(!await paired())return;await connect();await nativeRequest("claim");owned=true;if(!heartbeat)heartbeat=setInterval(()=>{if(!choosing)void nativeRequest("heartbeat",{},5000).catch(()=>{port?.disconnect();disconnected();});},1000);}
export async function releaseDesktop(){if(heartbeat)clearInterval(heartbeat);heartbeat=null;owned=false;if(port)await nativeRequest("release").catch(()=>{});owned=false;if(heartbeat)clearInterval(heartbeat);heartbeat=null;}
export async function disconnectDesktop(){await releaseDesktop();port?.disconnect();disconnected();await chrome.storage.local.set({desktopPaired:false});}
