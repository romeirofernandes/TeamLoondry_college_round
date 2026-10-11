import {test,expect} from "@playwright/test";
test("setup starts stopped, uses explicit inputs and persists opt-in dwell",async({page},info)=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/");
 await expect(page.getByRole("heading",{name:"Choose your inputs"})).toBeVisible();await expect(page.getByText("Your camera is off")).toBeVisible();await expect(page.getByRole("button",{name:/Calibrate & set up/})).toBeDisabled();
 await page.getByLabel("Click after holding still").check();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("handsfree-desktop-v1")??"{}").dwell)).toBe(true);
 await page.getByLabel("Hand movement",{exact:true}).check();await page.getByRole("button",{name:"Hand",exact:true}).click();await expect(page.getByRole("button",{name:"Hand",exact:true})).toHaveClass(/selected/);
 await page.getByRole("button",{name:"Continue to access"}).click();await expect(page.getByRole("heading",{name:"Allow only what you use"})).toBeVisible();
 await page.getByRole("button",{name:"Continue to practice"}).click();await expect(page.getByRole("heading",{name:"Practice at your pace"})).toBeVisible();
 await page.getByRole("button",{name:"Continue to ready"}).click();await expect(page.getByRole("button",{name:"Show compact panel"})).toBeDisabled();
 await page.screenshot({path:`test-results/setup-${info.project.name}.png`,fullPage:true});expect(errors).toEqual([]);
});
test("compact popup contains only camera and start, with a draggable camera area",async({page},info)=>{
 await page.addInitScript(()=>{
  localStorage.setItem("handsfree-desktop-v1",JSON.stringify({version:1,mode:"face",sensitivity:1,dwell:false,calibrations:{face:{neutralX:.5,neutralY:.5,rangeX:.1,rangeY:.1}}}));
  (window as any).isTauri=true;
  const session={phase:"stopped",epoch:0,reason:"Ready",displayId:1};
  (window as any).__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd:string)=>cmd==="status"?{session,capabilities:{nativeControl:true,inputAccess:true,version:"test",displays:[{id:1,width:1024,height:900,x:0,y:0}]}}:cmd==="control"?session:null};
 });
 await page.goto("/");await page.getByRole("button",{name:"4. Ready"}).click();await page.getByRole("button",{name:"Show compact panel"}).click();
 await expect(page.locator("main")).toHaveClass("compact");await expect(page.locator("main button")).toHaveCount(1);await expect(page.getByRole("button",{name:"Start",exact:true})).toBeEnabled();await expect(page.locator('[data-tauri-drag-region="true"]')).toHaveCount(1);await expect(page.getByRole("heading")).toHaveCount(0);await page.screenshot({path:`test-results/popup-${info.project.name}.png`});
});
test("setup fits narrow viewports and retains keyboard focus",async({page})=>{await page.goto("/");const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));expect(size.scroll).toBeLessThanOrEqual(size.client);await page.keyboard.press("Tab");await expect(page.locator(":focus-visible")).toHaveCount(1);});
test("voice-only starts without requesting camera or native pointer access",async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem("handsfree-desktop-v1",JSON.stringify({version:1,enabledInputs:["voice"],mode:"face",calibrations:{}}));
  (window as any).isTauri=true;(window as any).calls=[];let session={phase:"stopped",epoch:0,reason:"Ready",displayId:0};
  (window as any).__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd:string,args:any)=>{(window as any).calls.push({cmd,args});if(cmd==="start")session={phase:"running",epoch:1,reason:"Voice controls enabled",displayId:0};if(cmd==="status")return {session,capabilities:{nativeControl:true,inputAccess:false,version:"test",displays:[]}};return cmd==="start"||cmd==="control"?session:null;}};
  Object.defineProperty(navigator,"mediaDevices",{value:{getUserMedia:()=>{throw new Error("Camera requested during voice-only session");}}});
 });
 await page.goto("/");await expect(page.getByRole("button",{name:"Start",exact:true})).toBeEnabled();await page.getByRole("button",{name:"Start",exact:true}).click();await expect(page.getByRole("heading",{name:"Speak a command."})).toBeVisible();await expect(page.getByText("Your camera is off")).toBeVisible();
 const calls=await page.evaluate(()=>(window as any).calls);expect(calls.find((c:any)=>c.cmd==="start").args.pointerEnabled).toBe(false);expect(calls.some((c:any)=>c.cmd==="voice_start")).toBe(true);expect(calls.some((c:any)=>c.cmd==="capture_allowed")).toBe(false);
});
test("a voice startup error stops the session and keeps compact controls visible",async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem("handsfree-desktop-onboarded","1");localStorage.setItem("handsfree-desktop-v1",JSON.stringify({version:1,enabledInputs:["voice"],calibrations:{}}));
  (window as any).isTauri=true;let session={phase:"stopped",epoch:0,reason:"Ready",displayId:0};
  (window as any).__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd:string)=>{if(cmd==="start")session={...session,phase:"running",epoch:1};if(cmd==="voice_start")throw new Error("Speech helper could not start");if(cmd==="control")session={...session,phase:"stopped",epoch:2};if(cmd==="status")return {session,capabilities:{nativeControl:true,inputAccess:false,displays:[]}};return cmd==="start"||cmd==="control"?session:null;}};
 });
 await page.goto("/");await page.getByRole("button",{name:"Start",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Speech helper could not start");await expect(page.getByRole("button",{name:"Start",exact:true})).toBeVisible();await expect(page.locator("main button")).toHaveCount(1);const box=await page.locator("main").boundingBox();expect(box!.height).toBeLessThanOrEqual(310);
});
test('password popup handoff fails closed without calibration and never starts speech',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('handsfree-desktop-onboarded','1');localStorage.setItem('handsfree-desktop-v1',JSON.stringify({version:1,enabledInputs:['face','voice'],mode:'face',calibrations:{}}));
  (window as any).isTauri=true;(window as any).calls=[];const callbacks:any={},events:any={};let next=0;
  (window as any).emitNative=(name:string,payload:any)=>callbacks[events[name]]?.({event:name,id:1,payload});
  (window as any).__TAURI_INTERNALS__={transformCallback:(fn:any)=>{callbacks[++next]=fn;return next;},invoke:async(cmd:string,args:any)=>{
   (window as any).calls.push({cmd,args});if(cmd==='plugin:event|listen'){events[args.event]=args.handler;return 1;}
   const session={phase:'stopped',epoch:0,reason:'Ready',displayId:1};if(cmd==='status')return {session,capabilities:{nativeControl:true,inputAccess:true,displays:[{id:1,width:1024,height:900}]}};return cmd==='control'?session:null;
  }};
 });
 await page.goto('/');await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.cmd==='plugin:event|listen'&&c.args.event==='credential-control'));
 await page.evaluate(()=>(window as any).emitNative('credential-control','fixture-token'));
 await expect(page.getByRole('alert')).toContainText('Calibrate head or hand');
 const calls=await page.evaluate(()=>(window as any).calls);expect(calls.some((c:any)=>c.cmd==='voice_start')).toBe(false);expect(calls.some((c:any)=>c.cmd==='credential_return'&&c.args.token==='fixture-token')).toBe(true);
});
test('password popup session keeps voice off, fits compact panel and releases camera before return',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('handsfree-desktop-onboarded','1');localStorage.setItem('handsfree-desktop-v1',JSON.stringify({version:1,enabledInputs:['face','voice'],mode:'face',dwell:true,calibrations:{face:{neutralX:.5,neutralY:.5,rangeX:.1,rangeY:.1}}}));
  (window as any).isTauri=true;(window as any).calls=[];const callbacks:any={},events:any={};let next=0;let session={phase:'stopped',epoch:0,reason:'Ready',displayId:1};
  (window as any).emitNative=(name:string,payload:any)=>callbacks[events[name]]?.({event:name,id:1,payload});
  (window as any).__TAURI_INTERNALS__={transformCallback:(fn:any)=>{callbacks[++next]=fn;return next;},invoke:async(cmd:string,args:any)=>{
   (window as any).calls.push({cmd,args});if(cmd==='plugin:event|listen'){events[args.event]=args.handler;return 1;}
   if(cmd==='start')session={...session,phase:'running',epoch:1};if(cmd==='control')session={...session,phase:'stopped',epoch:2};
   if(cmd==='status')return {session,capabilities:{nativeControl:true,inputAccess:true,displays:[{id:1,width:1024,height:900}]}};return cmd==='control'||cmd==='start'?session:null;
  }};
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{const c=document.createElement('canvas');c.width=2;c.height=2;const stream=c.captureStream();for(const t of stream.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{(window as any).calls.push({cmd:'track-stop'});stop();};}return stream;}}});
  HTMLMediaElement.prototype.play=async()=>{};
  (window as any).Worker=class {onmessage:any;onerror:any;postMessage(m:any){if(m.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}terminate(){}};
 });
 await page.goto('/');await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.cmd==='plugin:event|listen'&&c.args.event==='credential-control'));
 await page.evaluate(()=>(window as any).emitNative('credential-control','fixture-token'));
 await expect(page.getByRole('button',{name:'Return to browser',exact:true})).toBeVisible();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.cmd==='credential_ready'));
 const box=await page.locator('main').boundingBox();expect(box!.height).toBeLessThanOrEqual(300);
 await page.getByRole('button',{name:'Return to browser',exact:true}).click();
 const calls=await page.evaluate(()=>(window as any).calls);expect(calls.some((c:any)=>c.cmd==='voice_start')).toBe(false);
 expect(calls.findIndex((c:any)=>c.cmd==='track-stop')).toBeLessThan(calls.findIndex((c:any)=>c.cmd==='credential_return'));
});
