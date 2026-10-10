import {test,expect} from "@playwright/test";
test("floating panel starts stopped with camera off and recovery controls clear",async({page},testInfo)=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");await expect(page.getByRole("heading",{level:1})).toContainText("A little movement");
 await expect(page.getByText("Your camera is off")).toBeVisible();await expect(page.getByText("Ready when you are")).toBeVisible();
 await expect(page.getByRole("button",{name:/Calibrate & set up/})).toBeDisabled();await expect(page.getByRole("button",{name:/Stop/})).toBeDisabled();
 const screenshot=testInfo.project.name==="desktop-panel"?"handsfree-floating-panel.png":"handsfree-floating-panel-compact.png";
 await page.screenshot({path:`test-results/${screenshot}`,fullPage:true});
 await page.getByRole("button",{name:"Preferences"}).click();
 await expect(page.getByRole("heading",{name:"Make it comfortable"})).toBeVisible();
 await expect(page.getByText(/Click after holding still/)).toBeVisible();
 await page.getByLabel("Click after holding still").check();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("handsfree-desktop-v1")??"{}").dwell)).toBe(true);
 await page.getByRole("button",{name:/Hand/}).click();await expect(page.getByRole("button",{name:/Hand/})).toHaveClass(/selected/);
 await expect(page.getByRole("button",{name:/Hand/})).toHaveClass(/selected/);
 await expect(page.getByText("Voice and coordinated extension control are coming in the next milestone.")).toBeVisible();
 expect(errors).toEqual([]);
});
test("panel fits the viewport without horizontal overflow",async({page})=>{
 await page.goto("/");await page.getByRole("button",{name:"Preferences"}).click();
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
 expect(width.scroll).toBeLessThanOrEqual(width.client);
 await page.keyboard.press("Tab");await expect(page.locator(":focus-visible")).toHaveCount(1);
});
