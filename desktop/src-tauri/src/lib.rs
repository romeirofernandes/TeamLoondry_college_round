mod native;
mod bridge;
mod commands;
mod speech;
mod session;
use serde_json::{json, Value};
use session::{Sample, Session, Snapshot};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
type Core = Mutex<Session>;

pub fn diagnostics() -> Value {
    json!({"product":"Handsfree","version":env!("CARGO_PKG_VERSION"),"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"nativeControl":cfg!(target_os="macos"),"inputAccess":native::trusted(),"accessibilityApi":native::accessibility_trusted(),"displays":native::displays().unwrap_or_default(),"state":"stopped","cloudSpeech":false,"voiceImplemented":cfg!(target_os="macos")})
}
#[tauri::command]
fn status(core:State<Core>)->Result<Value,String>{Ok(json!({"session":core.lock().map_err(|_|"Session lock failed")?.snapshot,"capabilities":diagnostics()}))}
#[tauri::command]
fn request_access()->bool{native::request_access()}
#[tauri::command]
fn open_help(kind:String)->Result<(),String>{
    let url=match kind.as_str(){"accessibility"=>"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility","camera"=>"x-apple.systempreferences:com.apple.preference.security?Privacy_Camera","dashboard"=>"http://localhost:3000/dashboard",_=>return Err("Unknown help destination".into())};
    #[cfg(target_os="macos")]
    {std::process::Command::new("/usr/bin/open").arg(url).spawn().map_err(|e|e.to_string())?;Ok(())}
    #[cfg(not(target_os="macos"))]
    {let _=url;Err("Open the website dashboard in your browser".into())}
}
#[tauri::command]
fn start(display_id:u32,pointer_enabled:Option<bool>,core:State<Core>,app:tauri::AppHandle)->Result<Snapshot,String>{
    let bridge=app.state::<bridge::Bridge>();
    let owner=bridge.owner.lock().map_err(|_|"Bridge lock failed")?;
    if owner.is_some(){return Err("Browser control is active. Stop it first.".into());}
    if pointer_enabled.unwrap_or(true)&&!native::trusted(){return Err("Allow Handsfree to control your Mac in Privacy & Security settings first".into());}
    if pointer_enabled.unwrap_or(true)&&!native::displays()?.iter().any(|d|d.id==display_id){return Err("Select an available display".into());}
    let mut session=core.lock().map_err(|_|"Session lock failed")?;
    session.start(display_id,Instant::now());
    if !pointer_enabled.unwrap_or(true){session.snapshot.reason="Voice controls enabled".into();}
    Ok(session.snapshot.clone())
}
#[tauri::command]
fn control(action:String,core:State<Core>,app:tauri::AppHandle)->Result<Snapshot,String>{
    speech::stop(&app);
    let mut session=core.lock().map_err(|_|"Session lock failed")?;
    match action.as_str(){"pause"=>Ok(session.pause("Paused")),"stop"=>Ok(session.stop()),_=>Err("Unknown session action".into())}
}
#[tauri::command]
fn heartbeat(epoch:u64,core:State<Core>)->Result<(),String>{core.lock().map_err(|_|"Session lock failed")?.heartbeat(epoch,Instant::now())}
#[tauri::command]
fn pointer(sample:Sample,core:State<Core>)->Result<(),String>{
    let mut session=core.lock().map_err(|_|"Session lock failed")?;
    if session.sample(&sample,Instant::now())? {
        if let Err(error)=native::move_pointer(session.snapshot.display_id,sample.x,sample.y){session.pause(&error);return Err(error);}
    }
    Ok(())
}
fn activate(app:&tauri::AppHandle,kind:&str)->Result<(),String>{
    let core=app.state::<Core>();let mut session=core.lock().map_err(|_|"Session lock failed")?;
    let epoch=session.snapshot.epoch;
    session.activation(epoch,Instant::now(),matches!(kind,"click"|"right"))?;
    match kind{"click"=>native::click(false),"right"=>native::click(true),"up"=>native::scroll(4),"down"=>native::scroll(-4),_=>Err("Unknown action".into())}
}
#[tauri::command]
fn dwell_click(epoch:u64,app:tauri::AppHandle)->Result<(),String>{
    let core=app.state::<Core>();let mut session=core.lock().map_err(|_|"Session lock failed")?;
    session.activation(epoch,Instant::now(),true)?;native::click(false)
}
#[tauri::command]
fn frontend_ready(app:tauri::AppHandle,view:Option<String>)->Result<(),String>{
    if let Ok(file)=std::env::var("HANDSFREE_SMOKE_REPORT"){
        let report=json!({"frontendReady":true,"view":view,"diagnostics":diagnostics()});
        std::fs::write(file,serde_json::to_vec_pretty(&report).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        if std::env::var("HANDSFREE_SMOKE_HOLD").as_deref()!=Ok("1"){app.exit(0);}
    }
    Ok(())
}
pub fn run(){
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_|{if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}}))
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event|{
            if event.state()!=ShortcutState::Pressed{return;}
            let key=shortcut.to_string();
            // Only pause is a toggle-free emergency operation. Resume is explicit.
            let outcome=if key.ends_with("KeyP") || key.ends_with("P") {
                let snapshot=app.state::<Core>().lock().map(|mut s|s.pause("Paused with keyboard shortcut")).ok();
                if let Some(s)=snapshot{let _=app.emit("session",s);} Ok(())
            }else if key.contains("Space"){activate(app,"click")}
            else if key.contains("ArrowUp"){activate(app,"up")}
            else if key.contains("ArrowDown"){activate(app,"down")}
            else{Ok(())};
            if let Err(error)=outcome{let _=app.emit("native-error",error);}
        }).build())
        .plugin(tauri_plugin_dialog::init())
        .manage(speech::Speech::default())
        .manage(bridge::Bridge::default())
        .manage(Mutex::new(Session::default()))
        .invoke_handler(tauri::generate_handler![status,request_access,open_help,start,control,heartbeat,pointer,dwell_click,frontend_ready,bridge::pair_extension,bridge::handoff_ready,bridge::capture_allowed,commands::native_command,commands::panel_layout,speech::voice_start,speech::voice_stop])
        .setup(|app|{
            if let Err(e)=bridge::serve(app.handle().clone()){eprintln!("Native bridge unavailable: {e}");}
            use tauri::menu::{Menu,MenuItem};
            let show=MenuItem::with_id(app,"show","Show Handsfree",true,None::<&str>)?;
            let settings=MenuItem::with_id(app,"settings","Settings and setup",true,None::<&str>)?;
            let pause=MenuItem::with_id(app,"pause","Pause control",true,None::<&str>)?;
            let quit=MenuItem::with_id(app,"quit","Quit Handsfree",true,None::<&str>)?;
            let menu=Menu::with_items(app,&[&show,&settings,&pause,&quit])?;
            let mut tray=tauri::tray::TrayIconBuilder::new().menu(&menu).tooltip("Handsfree").on_menu_event(|app,event|match event.id.as_ref(){
                "show"=>{if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}},
                "settings"=>{let _=app.emit("show-settings",());if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}},
                "pause"=>{if let Ok(mut s)=app.state::<Core>().lock(){let _=app.emit("session",s.pause("Paused from menu"));}},
                "quit"=>{speech::stop(app);app.exit(0)},_=>{}
            });
            if let Some(icon)=app.default_window_icon(){tray=tray.icon(icon.clone());}tray.build(app)?;
            for key in ["CommandOrControl+Shift+P","CommandOrControl+Shift+Space","CommandOrControl+Shift+ArrowUp","CommandOrControl+Shift+ArrowDown"]{
                if let Err(e)=app.global_shortcut().register(key){eprintln!("Shortcut unavailable: {key}: {e}");}
            }
            let handle=app.handle().clone();
            std::thread::spawn(move||loop{
                std::thread::sleep(Duration::from_millis(100));
                if let Ok(mut s)=handle.state::<Core>().lock(){if s.watchdog(Instant::now()){let _=handle.emit("session",s.snapshot.clone());}}
            });
            Ok(())
        })
        .on_window_event(|window,event|{if let tauri::WindowEvent::CloseRequested{api,..}=event{api.prevent_close();speech::stop(window.app_handle());if let Ok(mut s)=window.state::<Core>().lock(){let _=window.emit("session",s.stop());}let _=window.hide();}})
        .run(tauri::generate_context!()).expect("Could not start Handsfree");
}

pub fn native_host()->Result<(),String>{bridge::native_host()}

pub fn register_extension(id:&str)->Result<(),String>{bridge::register(id)}
