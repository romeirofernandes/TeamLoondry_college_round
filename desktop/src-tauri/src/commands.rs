use tauri::Manager;
pub fn bundle_id(text:&str)->Option<&'static str>{
 let text=text.trim().to_ascii_lowercase();let name=text.strip_prefix("open ").or_else(||text.strip_prefix("launch "))?;
 match name.trim(){"finder"=>Some("com.apple.finder"),"safari"=>Some("com.apple.Safari"),"vs code"|"vscode"|"visual studio code"=>Some("com.microsoft.VSCode"),"textedit"|"text edit"=>Some("com.apple.TextEdit"),"notes"=>Some("com.apple.Notes"),"mail"=>Some("com.apple.mail"),"calendar"=>Some("com.apple.iCal"),"preview"=>Some("com.apple.Preview"),"music"=>Some("com.apple.Music"),"terminal"=>Some("com.apple.Terminal"),"chrome"|"google chrome"=>Some("com.google.Chrome"),_=>None}
}
#[tauri::command]
pub fn native_command(text:String,app:tauri::AppHandle)->Result<String,String>{
 crate::bridge::assert_desktop(&app)?;
 let bundle=bundle_id(&text).ok_or("Try open Finder, open Safari, open VS Code, open TextEdit, open Notes, open Mail, open Calendar, open Preview, open Music, open Terminal or open Chrome")?;
 #[cfg(target_os="macos")] {let result=std::process::Command::new("/usr/bin/open").args(["-b",bundle]).output().map_err(|e|e.to_string())?;if !result.status.success(){return Err("This app could not open. Check that it is installed.".into());}Ok(format!("Opened {}",text.trim().split_once(' ').unwrap().1))}
 #[cfg(not(target_os="macos"))]{let _=(bundle,app);Err("App launching currently requires macOS".into())}
}
#[tauri::command]
pub fn panel_layout(compact:bool,corner:Option<String>,app:tauri::AppHandle)->Result<(),String>{
 let w=app.get_webview_window("main").ok_or("Panel unavailable")?;
 w.set_min_size(Some(tauri::LogicalSize::new(300.,if compact{240.}else{560.}))).map_err(|e|e.to_string())?;
 w.set_size(tauri::LogicalSize::new(if compact{320.}else{420.},if compact{300.}else{740.})).map_err(|e|e.to_string())?;
 w.set_decorations(!compact).map_err(|e|e.to_string())?;
 w.set_resizable(!compact).map_err(|e|e.to_string())?;
 w.set_always_on_top(compact).map_err(|e|e.to_string())?;
 if let Some(corner)=corner{let monitor=w.current_monitor().map_err(|e|e.to_string())?.ok_or("Display unavailable")?;let factor=monitor.scale_factor();let origin=monitor.position().to_logical::<f64>(factor);let size=monitor.size().to_logical::<f64>(factor);let (width,height)=if compact{(320.,300.)}else{(420.,740.)};let x=if corner.ends_with("right"){origin.x+size.width-width-24.}else{origin.x+24.};let y=if corner.starts_with("bottom"){origin.y+size.height-height-48.}else{origin.y+48.};w.set_position(tauri::LogicalPosition::new(x,y)).map_err(|e|e.to_string())?;}
 Ok(())
}
#[cfg(test)]mod tests{use super::*;#[test]fn allowlist(){assert_eq!(bundle_id("Open Finder"),Some("com.apple.finder"));assert_eq!(bundle_id("launch Safari"),Some("com.apple.Safari"));assert_eq!(bundle_id("open Finder; rm -rf /"),None);assert_eq!(bundle_id("open https://example.com"),None);}}
