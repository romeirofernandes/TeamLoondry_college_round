// Read-only DOM inspection in an isolated Chromium profile. No cookies/accounts are copied.
// This does not measure recognition or qualify account/player workflows.
import {chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
const staging=await mkdtemp(path.join(os.tmpdir(),'handsfree-public-'));
let context;
try {
 const dist=path.join(staging,'extension');await cp(path.resolve('dist'),dist,{recursive:true});
 const manifest=JSON.parse(await readFile(path.join(dist,'manifest.json'),'utf8'));manifest.permissions.push('tabs');manifest.host_permissions.push('https://*/*');await writeFile(path.join(dist,'manifest.json'),JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(path.join(staging,'profile'),{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,ignoreHTTPSErrors:true,args:[`--load-extension=${dist}`,`--disable-extensions-except=${dist}`,'--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),popup=await context.newPage();await popup.goto(`chrome-extension://${worker.url().split('/')[2]}/popup.html`);
 const send=message=>popup.evaluate(message=>chrome.runtime.sendMessage(message),message);
 await send({type:'SAVE_PROVIDERS',groqKeys:[],jevKey:''});await send({type:'SAVE_SETTINGS',settings:{...await send({type:'GET_SETTINGS'}),voiceOnly:true,spokenFeedback:false,dwellEnabled:false,edgeScroll:false}});
 const page=await context.newPage();
 for(const [site,url] of [ ['wikipedia','https://en.wikipedia.org/wiki/India'],['github','https://github.com/microsoft/vscode'],['reddit','https://www.reddit.com/r/accessibility/'],['amazon','https://www.amazon.in/s?k=headphones'],['spotify','https://open.spotify.com/search/Radiohead'],['netflix','https://www.netflix.com/'],['x','https://x.com/search?q=accessibility'],['whatsapp','https://web.whatsapp.com/'],['gmail','https://mail.google.com/mail/u/0/'],['meet','https://meet.google.com/'],['linkedin','https://www.linkedin.com/jobs/search/?keywords=data%20analyst'],['irctc','https://www.irctc.co.in/nget/train-search'],['maps','https://www.google.com/maps/search/?api=1&query=Bengaluru+Palace'] ].filter(([site])=>!process.argv.slice(2).length||process.argv.slice(2).includes(site))) {
  try {
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});
   const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url)?.id,page.url());
   await send({type:'START',tabId});await page.waitForSelector('#handsfree-assist-overlay',{state:'attached',timeout:5000});
   const snapshot=await send({type:'GET_SITE_CONTEXT'});
   const states={};for(const capability of snapshot?.capabilities||[])states[capability.state]=(states[capability.state]||0)+1;
   console.log(JSON.stringify({site,adapter:snapshot?.site||null,entities:snapshot?.entities.length||0,current:!!snapshot?.current,states,signedIn:false,qualification:'DOM inspection only'}));
   if(site === 'maps' && snapshot?.site === 'maps') {await send({type:'HEARD',text:'read the address'});console.log(JSON.stringify({site,addressRead:(await send({type:'GET_STATE'})).feedback.slice(0,300),qualification:'read-only typed-command smoke only'}));}
   if(site==='wikipedia') {
    console.log(JSON.stringify({site,geographyHeadings:snapshot.entities.filter(e=>e.kind==='section'&&e.label==='Geography').map(e=>({label:e.label,href:e.href}))}));
    await send({type:'HEARD',text:'list the sections'});const sections=(await send({type:'GET_STATE'})).feedback;
    await send({type:'HEARD',text:'take me to Geography section'});let navigation=(await send({type:'GET_STATE'})).feedback;
    if(/Which item/.test(navigation)){await send({type:'HEARD',text:'choose one'});navigation=(await send({type:'GET_STATE'})).feedback;}
    console.log(JSON.stringify({site,sectionsAnnounced:/Which item/.test(sections),geographyVerified:/At Geography/.test(navigation),navigationFeedback:navigation}));
   }
   await send({type:'STOP'});
  } catch(error) { console.log(JSON.stringify({site,result:'unavailable',reason:String(error.message).split('\n')[0].slice(0,180)})); }
 }
} finally {await context?.close();await rm(staging,{recursive:true,force:true});}
