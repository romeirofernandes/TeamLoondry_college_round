// Run with a local Next server: node tests/dashboard-next.mjs
// Optional axe checks: install @axe-core/playwright in your QA environment.
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const AxeBuilder = await import('@axe-core/playwright').then(module => module.default).catch(() => null);
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardOrigin = process.env.HANDSFREE_DASHBOARD_ORIGIN || 'http://localhost:3000';
const temp=await mkdtemp('/tmp/handsfree-dashboard-connected-');
const dist=path.join(temp,'extension');
await cp(path.join(extensionRoot, 'dist'),dist,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(dist,'manifest.json'),'utf8'));
manifest.permissions.push('tabs');
await writeFile(path.join(dist,'manifest.json'),JSON.stringify(manifest));
const context=await chromium.launchPersistentContext(path.join(temp,'profile'),{executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:[`--load-extension=${dist}`,`--disable-extensions-except=${dist}`,'--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],viewport:{width:1280,height:900}});
const reports=[];
try {
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
 const send=message=>popup.evaluate(message=>chrome.runtime.sendMessage(message),message);
 await send({type:'SAVE_PROVIDERS',groqKeys:[],jevKey:''});
 await send({type:'SET_DASHBOARD_URL',url:`${dashboardOrigin}/dashboard`});
 await send({type:'SAVE_SETTINGS',settings:{...(await send({type:'GET_SETTINGS'})),onboardingCompleted:true,enabledInputs:['voice','face','hand']}});
 const target=await context.newPage();await target.goto(`${dashboardOrigin}/`);
 const tabId=await worker.evaluate(async origin=>{const [tab]=await chrome.tabs.query({url:`${origin}/`});return tab.id;}, dashboardOrigin);
 const opened=context.waitForEvent('page');await send({type:'OPEN_DASHBOARD',tabId});const dashboard=await opened;
await dashboard.bringToFront();await dashboard.waitForLoadState('domcontentloaded');
 await dashboard.getByRole('button',{name:'Start session',exact:true}).waitFor({timeout:15000});
 await dashboard.goto(`${dashboardOrigin}/dashboard#tabs`);
 await expect(dashboard.getByRole('heading',{name:'Open tabs',exact:true})).toBeVisible();
 await expect(dashboard.locator('[role="tabpanel"][data-state="active"]')).toContainText('Open tabs');
 await expect(dashboard.getByRole('tab',{name:'Tabs',exact:true})).toHaveCount(0);
 await expect(dashboard.getByRole('heading',{name:'Move between pages',exact:true})).toHaveCount(0);
 await dashboard.getByRole('button',{name:'Refresh tabs',exact:true}).click();
 await dashboard.screenshot({path:path.join(extensionRoot,'test-results/session-cleanup.png'),fullPage:true});
 await expect(dashboard.locator('.dashboard-browser-tabs li').first()).toBeVisible();
 const docs=await context.newPage();await docs.goto(`${dashboardOrigin}/docs`);
 await docs.locator('summary').filter({hasText:'Move between pages'}).click();
 await expect(docs.getByText('Background search for jazz',{exact:true})).toBeVisible();
 await docs.close();await dashboard.bringToFront();
 reports.push({sessionTabList:true,legacyTabsLink:true,commandsInDocs:true});
 await dashboard.getByRole('button',{name:'Start session',exact:true}).click();
 await dashboard.getByRole('button',{name:'Pause session',exact:true}).waitFor();
 await dashboard.getByLabel('Type a command').fill('scroll down');
 await dashboard.getByRole('button',{name:'Run',exact:true}).click();
 await target.waitForFunction(()=>scrollY>0);
 await dashboard.getByRole('button',{name:'Pause session',exact:true}).click();
 await dashboard.getByRole('button',{name:'Resume session',exact:true}).waitFor();
 if(!(await send({type:'GET_STATE'})).paused)throw new Error('Pause state not bridged');
 await dashboard.getByRole('button',{name:'Resume session',exact:true}).click();
 await dashboard.getByRole('button',{name:'Pause session',exact:true}).waitFor();
 await send({type:'SAVE_PROVIDERS',groqKeys:['fixture-groq-key'],jevKey:''});
 await worker.evaluate(()=>{
  const scope=globalThis;
  scope.fixtureOriginalFetch=scope.fetch;
  scope.fetch=async(url,init)=>String(url).startsWith('https://api.groq.com/')
   ? new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({ids:[],answer:'A connected dashboard answer.'})}}]}),{status:200,headers:{'Content-Type':'application/json'}})
   : scope.fixtureOriginalFetch(url,init);
 });
 try {
  await dashboard.getByLabel('Type a command').fill('hey handsfree what is a browser?');
  await dashboard.getByRole('button',{name:'Run',exact:true}).click();
  await expect(dashboard.getByText('A connected dashboard answer.',{exact:true})).toBeVisible();
  await expect(target.locator('#handsfree-assist-overlay .feedback')).toHaveText('A connected dashboard answer.');
 } finally {
  await worker.evaluate(()=>{globalThis.fetch=globalThis.fixtureOriginalFetch;delete globalThis.fixtureOriginalFetch;});
  await send({type:'SAVE_PROVIDERS',groqKeys:[],jevKey:''});
 }
 reports.push({wakeAnswerDashboard:true,wakeAnswerOverlay:true});
 await dashboard.getByRole('button',{name:'Stop',exact:true}).click();
 await dashboard.getByRole('button',{name:'Start session',exact:true}).waitFor();
 if((await send({type:'GET_STATE'})).running)throw new Error('Stop did not release session');
 await dashboard.getByRole('button',{name:'Profile and preferences',exact:true}).click();
 await dashboard.getByRole('tab',{name:'Permissions',exact:true}).click();
 await dashboard.locator('summary').filter({hasText:'Message sending for testing'}).click();
 await dashboard.getByLabel('Owned test recipients for Gmail and Meet',{exact:true}).fill('gmail:owned@example.test, whatsapp:owned-chat, meet:abc-defg-hij');
 await dashboard.getByRole('button',{name:'Save test recipients',exact:true}).click();
 await expect.poll(async()=>(await send({type:'GET_SETTINGS'})).testMessageRecipients).toEqual(['gmail:owned@example.test','whatsapp:owned-chat','meet:abc-defg-hij']);
 await dashboard.reload();await dashboard.getByRole('tab',{name:'Permissions',exact:true}).click();await dashboard.locator('summary').filter({hasText:'Message sending for testing'}).click();
 await expect(dashboard.getByLabel('Owned test recipients for Gmail and Meet',{exact:true})).toHaveValue('gmail:owned@example.test, whatsapp:owned-chat, meet:abc-defg-hij');
 reports.push({ownedTestRecipientsPersist:true});
 await dashboard.getByRole('tab',{name:'Controls',exact:true}).click();await dashboard.locator('summary').filter({hasText:'Pointer & calibration'}).click();
 const sensitivity=dashboard.getByRole('slider',{name:'Sensitivity',exact:true});
 const dwell=dashboard.getByRole('slider',{name:'Dwell time',exact:true});
 const scroll=dashboard.getByRole('slider',{name:'Scroll speed',exact:true});
 await expect(sensitivity).toHaveAttribute('aria-valuemax','6');
 await expect(dwell).toHaveAttribute('aria-valuemax','5000');
 await expect(scroll).toHaveAttribute('aria-valuemin','0.2');
 await expect(scroll).toHaveAttribute('aria-valuemax','3');
 for(const slider of [sensitivity,dwell,scroll]){await slider.focus();await slider.press('End');}
 await expect.poll(async()=>await send({type:'GET_SETTINGS'})).toMatchObject({sensitivity:6,dwellMs:5000,scrollSensitivity:3});
 for(const style of ['Circle','Arrow','Crosshair','Spark']){
  await dashboard.getByRole('radio',{name:style,exact:true}).click();
  await expect.poll(async()=>(await send({type:'GET_SETTINGS'})).cursorStyle).toBe(style.toLowerCase());
  await dashboard.reload();await dashboard.getByRole('tab',{name:'Controls',exact:true}).click();await dashboard.locator('summary').filter({hasText:'Pointer & calibration'}).click();
  await expect(dashboard.getByRole('radio',{name:style,exact:true})).toBeChecked();
 }
 await expect(dashboard.getByText('Hold a small turn to keep moving. Return to neutral to stop in place.',{exact:true})).toBeVisible();
 await dashboard.getByRole('radio',{name:'Hand gestures',exact:true}).click();
 await expect(dashboard.getByText(/Keep your complete open palm in view/)).toBeVisible();
 const grants=await send({type:'GET_PERMISSIONS'});
 await dashboard.getByRole('tab',{name:'Permissions',exact:true}).click();
 for(const [label,kind] of [['Webpage control','pages'],['Tab commands','tabs']]) {
  await expect(dashboard.getByRole('switch',{name:label,exact:true})).toHaveAttribute('aria-checked',String(grants[kind]));
 }
 await dashboard.getByRole('tab',{name:'Controls',exact:true}).click();await dashboard.locator('summary').filter({hasText:'Pointer & calibration'}).click();
 const dwellSwitch=dashboard.getByRole('switch',{name:'Select with dwell',exact:true});
 const initialChecked=await dwellSwitch.getAttribute('aria-checked');
 const initialOffset=await dwellSwitch.locator('[data-slot="switch-thumb"]').evaluate(el=>getComputedStyle(el).translate);
 await dwellSwitch.click();
 await expect(dwellSwitch).toHaveAttribute('aria-checked',initialChecked==='true'?'false':'true');
 await expect.poll(()=>dwellSwitch.locator('[data-slot="switch-thumb"]').evaluate(el=>getComputedStyle(el).translate)).not.toBe(initialOffset);
 const photo=await popup.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;canvas.getContext('2d').fillRect(0,0,160,120);return canvas.toDataURL('image/jpeg');});
 await send({type:'SET_STATE',patch:{calibrationProgress:0.25,calibrationStage:'2/5 · left · Hold left',calibrationSnapshots:{center:photo}}});
 await expect(dashboard.getByAltText('center calibration capture')).toBeVisible();
 await expect(dashboard.locator('.dashboard-calibration-photos figure[data-active="true"]')).toContainText('left');
 const persisted=await worker.evaluate(async()=>{const {state}=await chrome.storage.session.get('state');return state.calibrationSnapshots;});
 if(Object.keys(persisted).length)throw new Error('Calibration photos persisted');
 await send({type:'SET_STATE',patch:{calibrationProgress:null,calibrationStage:'',calibrationSnapshots:{}}});
 reports.push({permissionStates:true,switchVisualState:true,calibrationPhotos:true,photosNotPersisted:true});
 reports.push({preferencesPersist:true,cursorChoices:true,expandedSliders:true});
 await mkdir(path.join(extensionRoot,'test-results'),{recursive:true});
 if (!AxeBuilder) reports.push({ accessibility: 'Install @axe-core/playwright to include automated accessibility checks.' });
 for(const theme of AxeBuilder ? ['light','dark'] : []){
  await dashboard.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);
  await dashboard.waitForTimeout(600);
  const result=await new AxeBuilder({page:dashboard}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  await dashboard.screenshot({path:path.join(extensionRoot,'test-results',`dashboard-pointer-${theme}.png`),fullPage:true});
  reports.push({theme,violations:result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))});
 }
 for(const width of [320,390,768,1280]){
  await dashboard.setViewportSize({width,height:900});
  const overflow=await dashboard.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await dashboard.screenshot({path:path.join(extensionRoot,'test-results',`dashboard-pointer-${width}.png`),fullPage:true});
  reports.push({width,overflow});if(overflow)throw new Error(`Overflow ${width}`);
 }
 reports.push({connected:true,commandScroll:true,pauseResume:true,stop:true});
 console.log(JSON.stringify(reports));
 await mkdir(path.join(extensionRoot, 'test-results'), { recursive: true });
 await writeFile(path.join(extensionRoot, 'test-results/dashboard-connected.json'),JSON.stringify(reports,null,2));
 if(reports.some(r=>r.violations?.length))process.exitCode=1;
}finally{await context.close();await rm(temp,{recursive:true,force:true});}
