import {test,expect} from "@playwright/test";
test("setup starts stopped, uses explicit inputs and persists opt-in dwell",async({page},info)=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/");
 await expect(page.getByRole("heading",{name:"Choose your inputs"})).toBeVisible();await expect(page.getByText("Your camera is off")).toBeVisible();await expect(page.getByRole("button",{name:/Calibrate & set up/})).toBeDisabled();
 await page.getByLabel("Click after holding still").check();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("handsfree-desktop-v1")??"{}").dwell)).toBe(true);
 await page.getByRole("button",{name:"Hand",exact:true}).click();await expect(page.getByRole("button",{name:"Hand",exact:true})).toHaveClass(/selected/);
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
