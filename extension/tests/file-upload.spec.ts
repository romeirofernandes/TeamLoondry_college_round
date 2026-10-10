import {test,expect,chromium} from "@playwright/test";
import {prepareUpload,commitUpload} from "../src/file-upload";
test("real Chromium file attachment retains bytes and fires one change without submission",async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium",args:["--no-sandbox"]});
 try{const page=await browser.newPage();await page.goto("http://127.0.0.1:4177");await page.evaluate(()=>{document.body.innerHTML='<form><input id="upload" type="file" accept=".txt"><button>Send</button></form>';(window as any).changes=0;(window as any).submits=0;document.querySelector("input")!.addEventListener("change",()=>{(window as any).changes++;});document.querySelector("form")!.addEventListener("submit",e=>{e.preventDefault();(window as any).submits++;});});
 const prepared=await page.evaluate(prepareUpload,"native-picker-fixture");expect(prepared.origin).toBe("http://127.0.0.1:4177");
 await page.evaluate(args=>{(window as any).__commitArgs=args;},[prepared.token,prepared.url,"report.txt","text/plain",[Buffer.from("Exact file bytes ✓").toString("base64")],Buffer.byteLength("Exact file bytes ✓")]);
 await page.evaluate(`(${commitUpload.toString()})(...window.__commitArgs)`);
 const result=await page.evaluate(async()=>{const f=document.querySelector<HTMLInputElement>("#upload")!.files![0];return {name:f.name,text:await f.text(),changes:(window as any).changes,submits:(window as any).submits};});expect(result).toEqual({name:"report.txt",text:"Exact file bytes ✓",changes:1,submits:0});
 }finally{await browser.close();}
});
