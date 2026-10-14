// Run against the built local Next site; uses an isolated browser profile.
import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
const origin=process.env.HANDSFREE_DASHBOARD_ORIGIN||'http://localhost:3000';
const temp=await mkdtemp(path.join(os.tmpdir(),'handsfree-meet-dashboard-'));const dist=path.join(temp,'extension');await cp(path.resolve('dist'),dist,{recursive:true});const manifest=JSON.parse(await readFile(path.join(dist,'manifest.json'),'utf8'));manifest.permissions.push('tabs');await writeFile(path.join(dist,'manifest.json'),JSON.stringify(manifest));
const context=await chromium.launchPersistentContext(path.join(temp,'profile'),{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,viewport:{width:1280,height:900},args:[`--load-extension=${dist}`,`--disable-extensions-except=${dist}`]});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);const send=m=>popup.evaluate(m=>chrome.runtime.sendMessage(m),m);
 await send({type:'SET_DASHBOARD_URL',url:origin+'/dashboard'});await send({type:'SAVE_SETTINGS',settings:{...await send({type:'GET_SETTINGS'}),onboardingCompleted:true,voiceOnly:true}});
 const target=await context.newPage();await target.goto(origin);const tabId=await worker.evaluate(async origin=>(await chrome.tabs.query({url:origin+'/'}))[0].id,origin);
 const opening=context.waitForEvent('page');await send({type:'OPEN_DASHBOARD',tabId});const dashboard=await opening;dashboard.on('pageerror',e=>console.log('pageerror',e.message));await dashboard.getByRole('button',{name:'Start session',exact:true}).waitFor();await dashboard.getByRole('button',{name:'Profile and preferences',exact:true}).click();await dashboard.getByRole('tab',{name:'Meet',exact:true}).click();
 await expect(dashboard.getByRole('heading',{name:'Google Meet',exact:true})).toBeVisible();
 await expect(dashboard.getByRole('button',{name:'Save Meet preferences',exact:true})).toBeVisible();
 await expect(dashboard.getByText('No verified local ISL/ASL motion pack is installed.',{exact:true})).toBeVisible();
 await dashboard.locator('#meet-hold').fill('1100');await dashboard.getByRole('button',{name:'Save Meet preferences',exact:true}).click();await expect(dashboard.getByText('Meet preferences saved.',{exact:true})).toBeVisible();
 expect((await send({type:'GET_MEET_STATUS'})).preferences.holdMs).toBe(1100);
 await dashboard.reload();await expect(dashboard.locator('#meet-hold')).toHaveValue('1100');
 await dashboard.getByRole('button',{name:'Reset Meet preferences',exact:true}).click();await expect(dashboard.locator('#meet-hold')).toHaveValue('700');
 await dashboard.screenshot({path:'test-results/meet-dashboard.png',fullPage:true});console.log('Meet dashboard bridge, save/reload/reset and unavailable signing state: passed.');
}finally{await context.close();await rm(temp,{recursive:true,force:true})}
