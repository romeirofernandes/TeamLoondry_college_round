import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(process.env.HANDSFREE_FIREFOX_TOOLS || extensionRoot, 'package.json'));
const { Builder } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const fixture = http.createServer((_request, response) => {
 response.setHeader('Content-Type', 'text/html');
 response.end('<!doctype html><title>Handsfree Firefox fixture</title><main style="height:5000px"><h1>Firefox fixture</h1><button id="target" onclick="this.textContent=\'Clicked\'">Test target</button></main>');
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const fixtureURL = `http://127.0.0.1:${fixture.address().port}/`;
import assert from 'node:assert/strict';
const options=new firefox.Options().addArguments('-headless').setBinary('/usr/bin/firefox');
options.setPreference('media.navigator.streams.fake',true).setPreference('media.navigator.permission.disabled',true).setPreference('extensions.autoDisableScopes',0);
const driver=await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(new firefox.ServiceBuilder(process.env.GECKODRIVER_PATH || 'geckodriver').addArguments('--allow-system-access')).build();
try {
 await driver.installAddon(path.resolve(extensionRoot, 'releases/handsfree-firefox-0.1.0.zip'),true);
 await driver.setContext('chrome');
 const uuid=await driver.executeScript('return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))["handsfree@teamloondry.org"]');
 await driver.setContext('content');
 await driver.get(`moz-extension://${uuid}/popup.html`);
 const send=message=>driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.runtime.sendMessage(arguments[0]).then(done,e=>done({error:String(e)}));',message);
 const settings=await send({type:'GET_SETTINGS'});
 assert.equal(settings.onboardingCompleted,false);
 assert.equal((await send({type:'GET_PROVIDER_STATUS'})).groqKeyCount,0);
 const target=await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.tabs.create({url:arguments[0],active:true}).then(done);',fixtureURL);
 await send({type:'SAVE_SETTINGS',settings:{...settings,enabledInputs:['face'],onboardingCompleted:true}});
 const started=await send({type:'START',tabId:target.id});

 assert.notEqual(started?.ok,false);
 await driver.wait(async()=> (await send({type:'GET_STATE'})).running,15000);
 const captures=await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.tabs.query({}).then(tabs=>done(tabs.filter(t=>t.url===browser.runtime.getURL("offscreen.html"))));');
 assert.equal(captures.length,1);

 await new Promise(resolve=>setTimeout(resolve,8000));
 const state=await send({type:'GET_STATE'});

 assert.equal(state.targetTabId,target.id);
 assert.ok(!/unavailable|denied|error/i.test(state.camera),state.camera);
 await send({type:'ACTION',intent:{type:'scroll',direction:'down'}});
 await driver.wait(async()=> await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.scripting.executeScript({target:{tabId:arguments[0]},func:()=>window.scrollY}).then(results=>done(results[0].result>0));',target.id),5000);
 const scrollY=await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.scripting.executeScript({target:{tabId:arguments[0]},func:()=>window.scrollY}).then(results=>done(results[0].result));',target.id);
 assert.ok(scrollY>0,'Typed scroll command must move the controlled page');
 await send({type:'ACTION',intent:{type:'click-target',query:'Test target'}});
 const clicked=await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.scripting.executeScript({target:{tabId:arguments[0]},func:()=>document.querySelector("#target").textContent}).then(results=>done(results[0].result));',target.id);
 assert.equal(clicked,'Clicked');
 await send({type:'PAUSE'}); assert.equal((await send({type:'GET_STATE'})).paused,true);
 await send({type:'RESUME'}); assert.equal((await send({type:'GET_STATE'})).paused,false);
 await send({type:'STOP'}); assert.equal((await send({type:'GET_STATE'})).running,false);
 const after=await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.tabs.query({}).then(tabs=>done(tabs.filter(t=>t.url===browser.runtime.getURL("offscreen.html"))));');
 assert.equal(after.length,0);
 console.log('Firefox load, key exclusion, camera worker, stable target, scroll, click, pause/resume and stop checks pass.');
} finally {await driver.quit(); await new Promise(resolve=>fixture.close(resolve));}
