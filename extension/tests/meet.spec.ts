import {test,expect,chromium,type BrowserContext,type Page,type Worker} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
let context:BrowserContext,controls:Page,meet:Page,worker:Worker,staging:string,tabId:number;
const message=(m:any)=>controls.evaluate(m=>chrome.runtime.sendMessage(m),m);
test.beforeAll(async()=>{
 staging=await mkdtemp(path.join(os.tmpdir(),'handsfree-meet-'));const dist=path.join(staging,'extension');await cp(path.resolve('dist'),dist,{recursive:true});
 const manifest=JSON.parse(await readFile(path.join(dist,'manifest.json'),'utf8'));manifest.permissions.push('tabs');manifest.host_permissions=['https://meet.google.com/*','http://127.0.0.1/*'];await writeFile(path.join(dist,'manifest.json'),JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(path.join(staging,'profile'),{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:[`--disable-extensions-except=${dist}`,`--load-extension=${dist}`,'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 await context.route('https://meet.google.com/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><button aria-label="Leave call">Leave call</button><button aria-label="Turn off microphone" onclick="this.setAttribute('aria-label',this.getAttribute('aria-label')==='Turn off microphone'?'Turn on microphone':'Turn off microphone')">Mic</button><div role="region" aria-label="Captions"><div data-caption-id="a"><span data-caption-speaker>Sam</span><span data-caption-text>Hello</span></div></div><aside>Unrelated private chat</aside>`}));
 worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');controls=await context.newPage();await controls.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
 await message({type:'SAVE_PROVIDERS',groqKeys:[],jevKey:''});await message({type:'SAVE_SETTINGS',settings:{...await message({type:'GET_SETTINGS'}),voiceOnly:true,dwellEnabled:false,spokenFeedback:false}});
 meet=await context.newPage();await meet.goto('https://meet.google.com/abc-defg-hij?pli=1');tabId=await worker.evaluate(async()=>(await chrome.tabs.query({url:'https://meet.google.com/abc-defg-hij*'}))[0].id!);await message({type:'START',tabId});await expect(meet.locator('#handsfree-assist-overlay')).toBeAttached();
});
test.afterAll(async()=>{await context?.close();if(staging)await rm(staging,{recursive:true,force:true})});
test('captures revisions, continues on a bound background tab, exports inert text and rejects stale sources',async()=>{
 expect(await message({type:'MEET_CONTROL',command:'start-transcript'})).toMatchObject({ok:true});
 await expect.poll(async()=>(await message({type:'GET_MEET_STATUS'})).sessions[0]?.lineCount).toBe(1);
 await meet.locator('[data-caption-text]').evaluate(e=>e.textContent='Hello everyone');
 await expect.poll(async()=>{const s=await message({type:'GET_MEET_STATUS'});return s.sessions[0]?.lineCount}).toBe(1);
 const other=await context.newPage();await other.goto('http://127.0.0.1:4177/');await other.bringToFront();
 await expect.poll(async()=>(await message({type:'GET_STATE'})).targetTabId).not.toBe(tabId);
 await meet.locator('[data-caption-id]').evaluate(e=>e.remove());await meet.locator('[role=region]').evaluate(e=>e.innerHTML='<div data-caption-id="b"><span data-caption-speaker>Pat</span><span data-caption-text>&lt;script&gt;inert&lt;/script&gt;</span></div>');
 await expect.poll(async()=>(await message({type:'GET_MEET_STATUS'})).sessions[0]?.lineCount).toBe(2);
 const status=await message({type:'GET_MEET_STATUS'});expect(JSON.stringify(status)).not.toContain('Hello everyone');
 expect(await message({type:'MEET_TRANSCRIPT_READ',id:status.sessions[0].id})).toMatchObject({ok:false});
 expect(await message({type:'MEET_CONTROL',command:'stop-transcript'})).toMatchObject({ok:true});
 const opening=context.waitForEvent('page');expect(await message({type:'MEET_TRANSCRIPT_EXPORT',id:status.sessions[0].id})).toMatchObject({ok:true});const viewer=await opening;await viewer.waitForLoadState();await expect(viewer.locator('pre')).toContainText('Hello everyone');await expect(viewer.locator('pre')).toContainText('<script>inert</script>');await expect(viewer.locator('pre')).not.toContainText('Unrelated private chat');expect(await viewer.locator('script').count()).toBe(1);
 await meet.locator('[data-caption-text]').evaluate(e=>e.textContent='late ignored');await expect.poll(async()=>(await message({type:'GET_MEET_STATUS'})).active).toBeNull();
});
test('requires the in-call prefix and keeps desired microphone controls deterministic',async()=>{
 await meet.bringToFront();await expect.poll(async()=>(await message({type:'GET_STATE'})).targetTabId).toBe(tabId);
 await message({type:'HEARD',text:'mute my mic'});await expect(meet.locator('button').nth(1)).toHaveAttribute('aria-label','Turn off microphone');
 await message({type:'HEARD',text:'Handsfree mute my mic'});await expect(meet.locator('button').nth(1)).toHaveAttribute('aria-label','Turn on microphone');
 await message({type:'HEARD',text:'Handsfree mute my mic'});await expect(meet.locator('button').nth(1)).toHaveAttribute('aria-label','Turn on microphone');
 for(const prefix of ['Hands-Free','Hands Free','Hey Handsfree','Hey, Hands-Free:']){
  await message({type:'HEARD',text:prefix+' unmute my mic'});await expect(meet.locator('button').nth(1)).toHaveAttribute('aria-label','Turn off microphone');
  await message({type:'HEARD',text:prefix+' mute my mic'});await expect(meet.locator('button').nth(1)).toHaveAttribute('aria-label','Turn on microphone');
 }
 await message({type:'STOP'});
});
