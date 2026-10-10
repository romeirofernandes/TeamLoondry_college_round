// @vitest-environment jsdom
import {describe,it,expect,beforeEach,vi} from "vitest";
import {acceptsFile,prepareUpload,commitUpload,clearUpload} from "../src/file-upload";
beforeEach(()=>{document.body.innerHTML="";});
describe("file attachment transaction",()=>{
 it("honors extension and MIME accept filters",()=>{expect(acceptsFile(".PDF,image/*","Report.PDF","application/pdf")).toBe(true);expect(acceptsFile("image/*","x.png","image/png")).toBe(true);expect(acceptsFile(".pdf","x.exe","application/octet-stream")).toBe(false);});
 it("refuses ambiguous inputs",()=>{document.body.innerHTML='<input type="file"><input type="file">';expect(()=>prepareUpload("t")).toThrow(/several/);});
 it("refuses missing, disabled and directory pickers",()=>{document.body.innerHTML='<input type="file" disabled>';expect(()=>prepareUpload("t")).toThrow(/No supported/);});
 it("selects a focused input without touching its neighbour",()=>{document.body.innerHTML='<input id="a" type="file"><input id="b" type="file">';document.querySelector<HTMLInputElement>("#b")!.focus();prepareUpload("token");expect(document.querySelector("#a")!.hasAttribute("data-handsfree-upload")).toBe(false);expect(document.querySelector("#b")!.getAttribute("data-handsfree-upload")).toBe("token");clearUpload("token");expect(document.querySelector("[data-handsfree-upload]")).toBeNull();});
 it("refuses changed URLs and replaced controls",()=>{document.body.innerHTML='<input type="file">';prepareUpload("t");expect(()=>commitUpload("t","https://different.example/","x.txt","text/plain",[],0)).toThrow(/page changed/);document.body.innerHTML='<input type="file">';expect(()=>commitUpload("t",location.href,"x.txt","text/plain",[],0)).toThrow(/original/);});
 it("rejects changed accept rules and incomplete transfers before firing events",()=>{document.body.innerHTML='<input type="file" accept=".pdf">';prepareUpload("t");const change=vi.fn();document.querySelector("input")!.addEventListener("change",change);expect(()=>commitUpload("t",location.href,"x.txt","text/plain",[],0)).toThrow(/allowed/);prepareUpload("t");expect(()=>commitUpload("t",location.href,"x.pdf","application/pdf",[btoa("a")],2)).toThrow(/Incomplete/);expect(change).not.toHaveBeenCalled();});
 it("assigns bytes once and dispatches input/change without submission",()=>{
  class Transfer{files:File[]=[];items={add:(f:File)=>{this.files.push(f);}}}vi.stubGlobal("DataTransfer",Transfer);
  document.body.innerHTML='<form><input type="file" accept=".txt"></form>';const input=document.querySelector("input")!;Object.defineProperty(input,"files",{writable:true,value:[]});const changed=vi.fn(),submit=vi.fn();input.addEventListener("change",changed);document.querySelector("form")!.addEventListener("submit",submit);prepareUpload("t");expect(commitUpload("t",location.href,"hello.txt","text/plain",[btoa("hello")],5)).toEqual({name:"hello.txt",count:1});expect(input.files![0].size).toBe(5);expect(changed).toHaveBeenCalledOnce();expect(submit).not.toHaveBeenCalled();vi.unstubAllGlobals();
 });
});
