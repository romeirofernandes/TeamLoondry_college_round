use std::{sync::Mutex,process::{Child,Command,Stdio},io::{BufRead,BufReader}};
use tauri::{Manager,Emitter};
#[derive(Default)]pub struct Speech(pub Mutex<Option<Child>>);
pub fn stop(app:&tauri::AppHandle){if let Ok(mut state)=app.state::<Speech>().0.lock(){if let Some(mut child)=state.take(){let _=child.kill();let _=child.wait();}}}
#[tauri::command]
pub fn voice_start(app:tauri::AppHandle,epoch:u64)->Result<(),String>{
 crate::bridge::assert_desktop(&app)?;if app.state::<crate::Core>().lock().map_err(|_|"Session lock failed")?.snapshot.epoch!=epoch{return Err("Session changed".into());}
 stop(&app);
 #[cfg(not(target_os="macos"))]return Err("Native voice requires macOS".into());
 #[cfg(target_os="macos")] {
 let path=app.path().resolve("resources/handsfree-speech",tauri::path::BaseDirectory::Resource).map_err(|e|e.to_string())?;
 let mut child=Command::new(path).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e|e.to_string())?;let output=child.stdout.take().ok_or("Speech output unavailable")?;*app.state::<Speech>().0.lock().unwrap()=Some(child);
 std::thread::spawn(move||{for line in BufReader::new(output).lines().map_while(Result::ok){let Ok(value)=serde_json::from_str::<serde_json::Value>(&line)else{continue;};let active=app.state::<crate::Core>().lock().map(|s|s.snapshot.epoch==epoch&&s.snapshot.phase==crate::session::Phase::Running).unwrap_or(false);if !active{break;}
 if value["kind"]=="utterance"{if let Some(text)=value["text"].as_str(){let normalized=text.trim().to_ascii_lowercase();if normalized=="stop handsfree"||normalized=="pause handsfree"{let snapshot=app.state::<crate::Core>().lock().unwrap().stop();let _=app.emit("session",snapshot);}else if crate::commands::bundle_id(&normalized).is_some(){let _=crate::commands::native_command(normalized,app.clone());}let _=app.emit("voice-transcript",text);}}
 else if value["kind"]=="error"{let _=app.emit("native-error",value["message"].as_str().unwrap_or("Speech unavailable"));} }
 });Ok(()) }
}
#[tauri::command]pub fn voice_stop(app:tauri::AppHandle){stop(&app);}
