// Run with a local Next server: node tests/dashboard-next.mjs
// Optional axe checks: install @axe-core/playwright in your QA environment.
import { chromium } from '@playwright/test';
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
 const target=await context.newPage();await target.goto(`${dashboardOrigin}/`);
 const tabId=await worker.evaluate(async origin=>{const [tab]=await chrome.tabs.query({url:`${origin}/`});return tab.id;}, dashboardOrigin);
 const opened=context.waitForEvent('page');await send({type:'OPEN_DASHBOARD',tabId});const dashboard=await opened;
await dashboard.bringToFront();await dashboard.waitForLoadState('domcontentloaded');
 await dashboard.getByRole('button',{name:'Start session',exact:true}).waitFor({timeout:15000});
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
 await dashboard.getByRole('button',{name:'Stop',exact:true}).click();
 await dashboard.getByRole('button',{name:'Start session',exact:true}).waitFor();
 if((await send({type:'GET_STATE'})).running)throw new Error('Stop did not release session');
 if (!AxeBuilder) reports.push({ accessibility: 'Install @axe-core/playwright to include automated accessibility checks.' });
 for(const theme of AxeBuilder ? ['light','dark'] : []){
  await dashboard.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);
  await dashboard.waitForTimeout(600);
  const result=await new AxeBuilder({page:dashboard}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  reports.push({theme,violations:result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))});
 }
 for(const width of [320,390,768,1280]){
  await dashboard.setViewportSize({width,height:900});
  const overflow=await dashboard.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  reports.push({width,overflow});if(overflow)throw new Error(`Overflow ${width}`);
 }
 reports.push({connected:true,commandScroll:true,pauseResume:true,stop:true});
 console.log(JSON.stringify(reports));
 await mkdir(path.join(extensionRoot, 'test-results'), { recursive: true });
 await writeFile(path.join(extensionRoot, 'test-results/dashboard-connected.json'),JSON.stringify(reports,null,2));
 if(reports.some(r=>r.violations?.length))process.exitCode=1;
}finally{await context.close();await rm(temp,{recursive:true,force:true});}
