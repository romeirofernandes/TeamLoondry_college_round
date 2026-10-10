/** Exercise the packaged extension and installed app through real Chrome pipes. */
import {createRequire} from 'node:module';
import {mkdtemp,cp,readFile,writeFile,rm,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(new URL('../../extension/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const binary=process.argv[2],bridgeDir=process.env.HANDSFREE_BRIDGE_DIR;
if(process.platform!=='darwin'||!binary||!bridgeDir)throw Error('This check needs the installed Mac app and isolated bridge directory.');
const temporary=await mkdtemp(path.join(os.tmpdir(),'handsfree-chrome-'));
const registries=['Google/Chrome','Microsoft Edge','Chromium'].map(browser=>path.join(os.homedir(),'Library/Application Support',browser,'NativeMessagingHosts/com.handsfree.desktop.json'));
const previous=new Map();for(const file of registries){previous.set(file,await readFile(file).catch(()=>null));}
const idFile=path.join(bridgeDir,'extension-id'),launcher=path.join(bridgeDir,'native-host.sh');
const oldId=await readFile(idFile),oldLauncher=await readFile(launcher);
const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Native bridge fixture</title><input type="file" accept=".txt"><button>Local fixture</button>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let context;
try{
 const extension=path.join(temporary,'extension');await cp(new URL('../../extension/dist/',import.meta.url),extension,{recursive:true});
 const manifest=JSON.parse(await readFile(path.join(extension,'manifest.json'),'utf8'));
 manifest.permissions=[...new Set([...manifest.permissions,'tabs'])];manifest.host_permissions=['http://127.0.0.1/*'];
 await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{executablePath:process.env.CHROMIUM_PATH||chromium.executablePath(),headless:true,env:process.env,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;
 execFileSync(binary,['--register-extension',id],{env:process.env});
 const shellQuote=value=>"'"+value.replaceAll("'","'\\''")+"'";
 // A PID marker belongs only to this isolated generated launcher, not the distributed app.
 const source=await readFile(launcher,'utf8');await writeFile(launcher,source.replace('#!/bin/sh\n',`#!/bin/sh\necho $$ > ${shellQuote(path.join(bridgeDir,'chrome-native-host.pid'))}\n`));
 const controls=await context.newPage();await controls.goto(`chrome-extension://${id}/popup.html`);
 const message=msg=>controls.evaluate(value=>chrome.runtime.sendMessage(value),msg);
 const page=await context.newPage();const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin+'/fixture');
 const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({url}))[0].id,page.url());
 const settings=await message({type:'GET_SETTINGS'});
 const saved=await message({type:'SAVE_SETTINGS',settings:{...settings,enabledInputs:['face'],voiceOnly:false,speechMode:'local',dwellEnabled:false,edgeScroll:false}});if(!saved?.ok)throw Error(JSON.stringify(saved));
 const connected=await message({type:'DESKTOP_CONNECT'});if(!connected?.ok)throw Error('Actual Chrome native connection failed: '+JSON.stringify(connected));
 const connectedPid=Number((await readFile(path.join(bridgeDir,'chrome-native-host.pid'),'utf8')).trim());
 async function until(predicate,label){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out: '+label);}
 // A second native host can show the panel only after the permission-check lease releases.
 const panelAvailable=()=>worker.evaluate(()=>new Promise(resolve=>{
  const probe=chrome.runtime.connectNative('com.handsfree.desktop');
  const timer=setTimeout(()=>{probe.disconnect();resolve(false);},3000);
  probe.onMessage.addListener(response=>{clearTimeout(timer);probe.disconnect();resolve(response.ok===true);});
  probe.onDisconnect.addListener(()=>{void chrome.runtime.lastError;clearTimeout(timer);resolve(false);});
  probe.postMessage({id:crypto.randomUUID(),type:'showPanel'});
 }));
 const lease=await context.newPage();await lease.goto(`chrome-extension://${id}/permissions.html`);
 await lease.evaluate(()=>new Promise((resolve,reject)=>{
  window.testCapturePort=chrome.runtime.connect({name:'handsfree-capture-check'});
  window.testCapturePort.onMessage.addListener(value=>value.ok?resolve(true):reject(Error(value.error)));
 }));
 await lease.close();await until(panelAvailable,'closing permission UI releases native capture ownership');
 const released=await controls.evaluate(()=>new Promise((resolve,reject)=>{
  const lease=chrome.runtime.connect({name:'handsfree-capture-check'});
  lease.onMessage.addListener(value=>{if(value.released){lease.disconnect();resolve(true);}else if(value.ok)lease.postMessage({release:true});else reject(Error(value.error));});
 }));
 if(!released||!await panelAvailable())throw Error('Completed permission-check lease did not release ownership');
 const offscreenCount=()=>worker.evaluate(async()=> (await chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]})).length);
 let started=await message({type:'START',tabId});if(!started?.ok)throw Error('Browser claim/capture failed: '+JSON.stringify(started));
 await until(async()=> (await message({type:'GET_STATE'})).trackingBackend==='Worker / CPU','real offscreen camera and bundled worker');
 const stopped=await message({type:'STOP'});if(!stopped?.ok)throw Error('Browser Stop failed');await until(async()=>await offscreenCount()===0,'offscreen release');
 started=await message({type:'START',tabId});if(!started?.ok)throw Error('Second browser claim failed: '+JSON.stringify(started));
 await until(async()=>await offscreenCount()===1,'second capture');
 const hostPid=connectedPid;if(!Number.isSafeInteger(hostPid)||hostPid<2)throw Error('Native host PID marker invalid');
 process.kill(hostPid,'SIGTERM');
 await until(async()=>!(await message({type:'GET_STATE'})).running,'connection loss stops the browser');await until(async()=>await offscreenCount()===0,'connection loss releases capture');
 if(!(await message({type:'DESKTOP_STATUS'})).paired)throw Error('Pairing was silently disabled on loss');
 await message({type:'DESKTOP_DISCONNECT'});
 console.log(JSON.stringify({nativeChromeConnected:true,permissionUICloseReleasesOwner:true,permissionCompletionReleasesOwner:true,captureHandoff:true,explicitStopReleasesCapture:true,secondClaim:true,hostLossStopsCapture:true,camera:'synthetic fixture; physical tracking unqualified'}));
}finally{
 await context?.close();await new Promise(resolve=>server.close(resolve));
 for(const [file,bytes] of previous){if(bytes)await writeFile(file,bytes);else await unlink(file).catch(()=>{});}
 await writeFile(idFile,oldId);await writeFile(launcher,oldLauncher);await rm(temporary,{recursive:true,force:true});
}
