import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('src-tauri/resources',{recursive:true});
if(process.platform==='darwin'){
 execFileSync('xcrun',['swiftc','native/Speech.swift','-O','-o','src-tauri/resources/handsfree-speech'],{stdio:'inherit'});
 execFileSync('codesign',['--force','--sign','-','src-tauri/resources/handsfree-speech'],{stdio:'inherit'});
}else await writeFile('src-tauri/resources/handsfree-speech','Mac-only speech helper\n');
