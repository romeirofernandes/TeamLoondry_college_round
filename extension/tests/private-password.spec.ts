import {test,expect,chromium,type BrowserContext,type Page,type CDPSession} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import type {Message} from '../src/shared';
let context:BrowserContext,page:Page,controls:Page,cdp:CDPSession,staging:string;
const requests:{url:string;body:string|null}[]=[];
const message=(msg:Message)=>controls.evaluate(msg=>chrome.runtime.sendMessage(msg),msg);
async function keyBox(label:string){
 const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
 const visit=(node:any):any=>{if(node.nodeName==='BUTTON'&&node.children?.some((n:any)=>n.nodeValue===label))return node;for(const child of [...(node.children??[]),...(node.shadowRoots??[])]){const found=visit(child);if(found)return found;}return null;};
 const node=visit(root);if(!node)throw new Error(`Missing private key ${label}`);
 const {model}=await cdp.send('DOM.getBoxModel',{nodeId:node.nodeId});const q=model.border;
 return {x:(q[0]+q[4])/2,y:(q[1]+q[5])/2};
}
async function clickKey(label:string){const p=await keyBox(label);await page.mouse.click(p.x,p.y);}
async function dwellKey(label:string,duration=900){
 const p=await keyBox(label),viewport=page.viewportSize()!;
 const end=Date.now()+duration;
 do {await message({type:'POINTER',sample:{x:p.x/viewport.width,y:p.y/viewport.height,confidence:1,timestamp:Date.now(),source:'face',handHold:false,fps:30,latencyMs:0}});await page.waitForTimeout(100);}while(Date.now()<end);
}
test.beforeAll(async()=>{
 staging=await mkdtemp(path.join(os.tmpdir(),'handsfree-private-'));const dist=path.join(staging,'extension');await cp(path.resolve('dist'),dist,{recursive:true});
 const manifest=JSON.parse(await readFile(path.join(dist,'manifest.json'),'utf8'));manifest.permissions.push('tabs');manifest.host_permissions=['http://127.0.0.1/*'];await writeFile(path.join(dist,'manifest.json'),JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(path.join(staging,'profile'),{executablePath:process.env.CHROMIUM_PATH,headless:true,viewport:{width:1280,height:900},args:[`--disable-extensions-except=${dist}`,`--load-extension=${dist}`,'--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 context.on('request',r=>requests.push({url:r.url(),body:r.postData()}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=worker.url().split('/')[2];controls=await context.newPage();await controls.goto(`chrome-extension://${id}/popup.html`);
 page=await context.newPage();await page.goto('http://127.0.0.1:4177');cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');
 const tabId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'http://127.0.0.1:4177/*'});return tabs[0].id!;});
 const settings=await message({type:'GET_SETTINGS'});await message({type:'SAVE_SETTINGS',settings:{...settings,enabledInputs:['face'],dwellEnabled:true,dwellMs:400}});await message({type:'START',tabId});await expect(page.locator('#handsfree-assist-overlay')).toBeAttached();
});
test.afterAll(async()=>{await context?.close();if(staging)await rm(staging,{recursive:true,force:true});});
test('packaged private keyboard dwells once, masks edits, never submits and leaks no sentinel',async()=>{
 await message({type:'HEARD',text:'open private keyboard'});
 await expect(page.locator('#handsfree-private-input')).toBeAttached();
 await expect.poll(async()=>(await message({type:'GET_STATE'})).privateInput).toBe(true);
 // Camera remains alive but deterministic samples must win over fake blank frames.
 await message({type:'OFFSCREEN_COMMAND',command:'pause'});
 await dwellKey('a',1400);await expect(page.locator('#password')).toHaveValue('a');
 await clickKey('Shift');await clickKey('B');await clickKey('Symbols');await clickKey('!');
 await expect(page.locator('#password')).toHaveValue('aB!');expect(await page.locator('#password').getAttribute('type')).toBe('password');
 expect(await page.locator('#handsfree-private-input').evaluate(el=>el.shadowRoot)).toBeNull();
 await clickKey('Done');await expect(page.locator('#submissions')).toHaveText('0');await expect(page.locator('#password')).toHaveValue('aB!');
 await message({type:'HEARD',text:'aB!'});await message({type:'TRANSCRIPT',text:'aB!',final:true});
 expect(await controls.evaluate(()=>chrome.storage.local.get(null))).not.toEqual(expect.objectContaining({password:'aB!'}));
 const stored=await controls.evaluate(async()=>({local:await chrome.storage.local.get(null),session:await chrome.storage.session.get(null)}));expect(JSON.stringify(stored)).not.toContain('aB!');
 expect(requests.some(r=>r.body?.includes('aB!'))).toBe(false);
 await clickKey('Resume voice');await expect.poll(async()=>(await message({type:'GET_STATE'})).privateInput).toBe(false);
 // Existing page clicking is restored after explicit exit.
 await message({type:'HEARD',text:'click count a selection'});await expect(page.locator('#clicks')).toHaveText('1');
});
