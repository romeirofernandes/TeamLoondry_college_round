//! Chrome native messaging over a user-only Unix socket. No HTTP listener.
use crate::Core;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{io::{Read,Write}, sync::{Mutex,Condvar}, time::Duration};
use tauri::{Emitter,Manager};
use tauri_plugin_dialog::DialogExt;
const MAX:usize=1024*1024;
const FILE_MAX:usize=20*1024*1024;
#[derive(Default)]
pub struct Bridge { pub owner:Mutex<Option<u64>>, pub credentials:Mutex<crate::credentials::CredentialControl>, pub released:(Mutex<bool>,Condvar) }
fn directory()->Result<std::path::PathBuf,String>{if let Some(value)=std::env::var_os("HANDSFREE_BRIDGE_DIR"){let path=std::path::PathBuf::from(value);if !path.is_absolute(){return Err("Bridge directory must be absolute".into());}return Ok(path);}std::env::var_os("HOME").map(|p|std::path::PathBuf::from(p).join(".handsfree")).ok_or("Home directory unavailable".into())}
fn read_frame(r:&mut impl Read)->Result<Value,String>{let mut n=[0;4];r.read_exact(&mut n).map_err(|e|e.to_string())?;let n=u32::from_ne_bytes(n) as usize;if n==0||n>MAX{return Err("Invalid native message length".into());}let mut body=vec![0;n];r.read_exact(&mut body).map_err(|e|e.to_string())?;serde_json::from_slice(&body).map_err(|e|e.to_string())}
fn write_frame(w:&mut impl Write,v:&Value)->Result<(),String>{let body=serde_json::to_vec(v).map_err(|e|e.to_string())?;if body.len()>MAX{return Err("Native response too large".into());}w.write_all(&(body.len() as u32).to_ne_bytes()).and_then(|_|w.write_all(&body)).and_then(|_|w.flush()).map_err(|e|e.to_string())}
pub fn native_host()->Result<(),String>{
 let dir=directory()?;let id=std::fs::read_to_string(dir.join("extension-id")).map_err(|_|"Pair the extension from Handsfree settings first")?;
 let origin=format!("chrome-extension://{}/",id.trim());
 if !std::env::args().any(|a|a==origin){return Err("Unpaired browser origin".into());}
 let mut socket=std::os::unix::net::UnixStream::connect(dir.join("desktop.sock")).map_err(|_|"Open Handsfree before connecting the extension")?;
 let mut input=std::io::stdin().lock();let mut output=std::io::stdout().lock();
 while let Ok(request)=read_frame(&mut input){write_frame(&mut socket,&request)?;let response=read_frame(&mut socket)?;write_frame(&mut output,&response)?;}Ok(())
}
pub fn register(id:&str)->Result<(),String>{
 if id.len()!=32||!id.bytes().all(|c|(b'a'..=b'p').contains(&c)){return Err("Copy the 32-letter extension ID from chrome://extensions".into());}
 #[cfg(not(target_os="macos"))] return Err("Native pairing currently requires macOS".into());
 #[cfg(target_os="macos")] {
 use std::os::unix::fs::PermissionsExt;
 let dir=directory()?;std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;std::fs::set_permissions(&dir,std::fs::Permissions::from_mode(0o700)).map_err(|e|e.to_string())?;
 let binary=std::env::current_exe().map_err(|e|e.to_string())?;
 let launcher=dir.join("native-host.sh");let escaped=binary.to_string_lossy().replace('\'',"'\\''");
 std::fs::write(&launcher,format!("#!/bin/sh\nexport HANDSFREE_BRIDGE_DIR='{}'\nexec '{}' --native-host \"$@\"\n",dir.to_string_lossy().replace('\'',"'\\''"),escaped)).map_err(|e|e.to_string())?;
 std::fs::set_permissions(&launcher,std::fs::Permissions::from_mode(0o700)).map_err(|e|e.to_string())?;
 std::fs::write(dir.join("extension-id"),id).map_err(|e|e.to_string())?;
 let manifest=json!({"name":"com.handsfree.desktop","description":"Handsfree session and file chooser bridge","path":launcher,"type":"stdio","allowed_origins":[format!("chrome-extension://{id}/")]});
 for browser in ["Google/Chrome","Microsoft Edge","Chromium"]{let target=std::path::PathBuf::from(std::env::var_os("HOME").unwrap()).join("Library/Application Support").join(browser).join("NativeMessagingHosts");std::fs::create_dir_all(&target).map_err(|e|e.to_string())?;std::fs::write(target.join("com.handsfree.desktop.json"),serde_json::to_vec_pretty(&manifest).unwrap()).map_err(|e|e.to_string())?;}Ok(()) }
}
pub fn assert_desktop(app:&tauri::AppHandle)->Result<(),String>{if app.state::<Bridge>().owner.lock().map_err(|_|"Bridge lock failed")?.is_some(){Err("Browser control is active. Stop it before starting desktop control.".into())}else{Ok(())}}
#[tauri::command]
pub fn pair_extension(id:String)->Result<(),String>{register(&id)}
#[tauri::command]
pub fn handoff_ready(app:tauri::AppHandle)->Result<(),String>{let state=app.state::<Bridge>();*state.released.0.lock().map_err(|_|"Bridge lock failed")?=true;state.released.1.notify_all();Ok(())}
#[tauri::command]
pub fn credential_ready(app:tauri::AppHandle,token:String)->Result<(),String>{app.state::<Bridge>().credentials.lock().map_err(|_|"Bridge lock failed")?.ready(&token)}
#[tauri::command]
pub fn credential_return(app:tauri::AppHandle,token:String)->Result<(),String>{
 let state=app.state::<Bridge>();let mut c=state.credentials.lock().map_err(|_|"Bridge lock failed")?;
 if c.token!=token || c.owner.is_none(){return Err("Password popup session changed".into());}
 crate::speech::stop(&app);
 let snapshot=app.state::<Core>().lock().map_err(|_|"Session lock failed")?.stop();let _=app.emit("session",snapshot);
 c.finish(&token)
}
#[tauri::command]
pub fn capture_allowed(app:tauri::AppHandle)->Result<(),String>{assert_desktop(&app)}
pub fn serve(app:tauri::AppHandle)->Result<(),String>{
 use std::os::unix::{net::UnixListener,fs::PermissionsExt};
 let dir=directory()?;std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;std::fs::set_permissions(&dir,std::fs::Permissions::from_mode(0o700)).map_err(|e|e.to_string())?;let path=dir.join("desktop.sock");let _=std::fs::remove_file(&path);let listener=UnixListener::bind(&path).map_err(|e|e.to_string())?;std::fs::set_permissions(&path,std::fs::Permissions::from_mode(0o600)).map_err(|e|e.to_string())?;
 std::thread::spawn(move||{let mut next=0u64;for stream in listener.incoming(){if let Ok(mut stream)=stream{next+=1;let owner=next;let app=app.clone();std::thread::spawn(move||{
 let _=stream.set_read_timeout(Some(Duration::from_secs(15)));let _=stream.set_write_timeout(Some(Duration::from_secs(10)));let mut file:Option<(String,Vec<u8>)>=None;
 while let Ok(req)=read_frame(&mut stream){let id=req.get("id").and_then(Value::as_str).unwrap_or("");if id.is_empty()||id.len()>64{break;}
 let result=(||->Result<Value,String>{let state=app.state::<Bridge>();let kind=req["type"].as_str().ok_or("Message type required")?;
 match kind{
 "hello"=>Ok(json!({"protocol":1,"version":env!("CARGO_PKG_VERSION"),"maxFileBytes":FILE_MAX})),
 "credentialControl"=>{
 let held=state.owner.lock().map_err(|_|"Bridge lock failed")?;
 if held.is_some(){return Err("Release browser capture before controlling a password popup".into());}
 state.credentials.lock().map_err(|_|"Bridge lock failed")?.begin(owner,id)?;
 crate::speech::stop(&app);
 let snapshot=app.state::<Core>().lock().map_err(|_|"Session lock failed")?.stop();let _=app.emit("session",snapshot);
 app.emit("credential-control",id).map_err(|e|e.to_string())?;
 if let Some(w)=app.get_webview_window("main"){w.show().map_err(|e|e.to_string())?;}
 Ok(json!({"phase":"starting"}))
 },
 "credentialStatus"=>Ok(json!({"phase":state.credentials.lock().map_err(|_|"Bridge lock failed")?.status(owner)?})),
 "credentialStop"=>{
 {let mut c=state.credentials.lock().map_err(|_|"Bridge lock failed")?;c.status(owner)?;let token=c.token.clone();c.phase="stopping";app.emit("credential-stop",token).map_err(|e|e.to_string())?;}
 crate::speech::stop(&app);let snapshot=app.state::<Core>().lock().map_err(|_|"Session lock failed")?.stop();let _=app.emit("session",snapshot);
 Ok(json!({"phase":"stopping"}))
 },
 "claim"=>{
 {let c=state.credentials.lock().map_err(|_|"Bridge lock failed")?;if c.owner.is_some(){if c.owner!=Some(owner)||c.phase!="returned"{return Err("Return from password popup control first".into());}}}
 {let mut held=state.owner.lock().map_err(|_|"Bridge lock failed")?;if held.is_some_and(|x|x!=owner){return Err("Another browser session owns capture".into());}if *held==Some(owner){return Ok(json!({"owner":"browser"}));}*held=Some(owner);state.credentials.lock().map_err(|_|"Bridge lock failed")?.clear();}
 *state.released.0.lock().map_err(|_|"Bridge lock failed")?=false;
 crate::speech::stop(&app);
 let snapshot=app.state::<Core>().lock().map_err(|_|"Session lock failed")?.stop();app.emit("session",snapshot).map_err(|e|e.to_string())?;app.emit("browser-handoff",()).map_err(|e|e.to_string())?;
 let guard=state.released.0.lock().map_err(|_|"Bridge lock failed")?;let (guard,_)=state.released.1.wait_timeout_while(guard,Duration::from_secs(8),|ready|!(*ready)).map_err(|_|"Capture acknowledgement failed")?;
 if !*guard{*state.owner.lock().unwrap()=None;return Err("Desktop capture has not acknowledged shutdown. Browser capture stayed off.".into());}
 if let Some(w)=app.get_webview_window("main"){w.hide().map_err(|e|e.to_string())?;}Ok(json!({"owner":"browser"}))
 },
 "showPanel"=>{assert_desktop(&app)?;app.emit("show-panel",()).map_err(|e|e.to_string())?;if let Some(w)=app.get_webview_window("main"){w.show().map_err(|e|e.to_string())?;}Ok(json!({"visible":true}))},
 "heartbeat"=>{if *state.owner.lock().unwrap()!=Some(owner){return Err("Browser does not own capture".into());}Ok(json!({"owner":"browser"}))},
 "release"=>{let mut held=state.owner.lock().unwrap();if *held==Some(owner){*held=None;}file=None;Ok(json!({"owner":"none"}))},
 "chooseFile"=>{
 if *state.owner.lock().unwrap()!=Some(owner){return Err("Start the paired browser session first".into());}
 file=None;let origin=req["origin"].as_str().filter(|s|s.len()<=300).ok_or("Website origin required")?;
 if !(origin.starts_with("https://")||origin.starts_with("http://")){return Err("Unsupported website".into());}
 let chosen=app.dialog().file().set_title(format!("Attach a file to {origin}")).blocking_pick_file();
 let Some(chosen)=chosen else{return Ok(json!({"cancelled":true}));};let path=chosen.into_path().map_err(|e|e.to_string())?;
 let meta=std::fs::metadata(&path).map_err(|e|e.to_string())?;if !meta.is_file()||meta.len()>FILE_MAX as u64{return Err("Choose a regular file up to 20 MiB".into());}
 let mut bytes=Vec::new();std::fs::File::open(&path).map_err(|e|e.to_string())?.take((FILE_MAX+1) as u64).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
 if bytes.len()>FILE_MAX{return Err("File changed or exceeds 20 MiB".into());}
 let name=path.file_name().ok_or("File name unavailable")?.to_string_lossy().to_string();let count=bytes.len().div_ceil(192*1024);let size=bytes.len();file=Some((id.into(),bytes));Ok(json!({"cancelled":false,"token":id,"name":name,"size":size,"chunks":count}))
 },
 "fileChunk"=>{if *state.owner.lock().unwrap()!=Some(owner){return Err("Browser ownership lost".into());}let (token,bytes)=file.as_ref().ok_or("No selected file")?;if req["token"].as_str()!=Some(token){return Err("File token mismatch".into());}let i=req["index"].as_u64().ok_or("Chunk index required")? as usize;let start=i.checked_mul(192*1024).ok_or("Invalid chunk index")?;if start>=bytes.len(){return Err("Chunk index out of bounds".into());}Ok(json!({"index":i,"data":STANDARD.encode(&bytes[start..(start+192*1024).min(bytes.len())])}))},
 "fileDone"=>{file=None;Ok(json!({"cleared":true}))},_=>Err("Unsupported native request".into())
 }})();let response=match result{Ok(v)=>json!({"id":id,"ok":true,"result":v}),Err(e)=>json!({"id":id,"ok":false,"error":e})};if write_frame(&mut stream,&response).is_err(){break;}
 }
 let state=app.state::<Bridge>();
 {let mut c=state.credentials.lock().unwrap();if c.owner==Some(owner){c.clear();crate::speech::stop(&app);if let Ok(mut core)=app.state::<Core>().lock(){let _=app.emit("session",core.stop());}let _=app.emit("browser-handoff",());}}
 if let Ok(mut held)=state.owner.lock(){if *held==Some(owner){*held=None;let _=app.emit("browser-released",());}};
 });}}});Ok(())
}
#[cfg(test)]mod tests{use super::*;#[test]fn framing_roundtrip(){let v=json!({"id":"1","type":"hello"});let mut bytes=Vec::new();write_frame(&mut bytes,&v).unwrap();assert_eq!(read_frame(&mut bytes.as_slice()).unwrap(),v);}#[test]fn oversized_rejected(){assert!(read_frame(&mut ((MAX+1) as u32).to_ne_bytes().as_slice()).is_err());}#[test]fn truncated_rejected(){assert!(read_frame(&mut [5,0,0,0,b'{'].as_slice()).is_err());}}
