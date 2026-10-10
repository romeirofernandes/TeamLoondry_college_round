use serde::Serialize;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Display { pub id: u32, pub x: f64, pub y: f64, pub width: f64, pub height: f64 }
pub fn point(display: &Display, x: f64, y: f64) -> Result<(f64, f64), String> {
    if ![x,y,display.x,display.y,display.width,display.height].iter().all(|v| v.is_finite()) || !(0.0..=1.0).contains(&x) || !(0.0..=1.0).contains(&y) || display.width < 1.0 || display.height < 1.0 { return Err("Invalid display coordinates".into()); }
    Ok((display.x + x*(display.width-1.0), display.y + y*(display.height-1.0)))
}
#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use std::ffi::c_void;
    #[repr(C)] #[derive(Clone,Copy)] struct Point { x:f64, y:f64 }
    #[repr(C)] #[derive(Clone,Copy)] struct Size { width:f64,height:f64 }
    #[repr(C)] #[derive(Clone,Copy)] struct Rect { origin:Point,size:Size }
    #[link(name="ApplicationServices",kind="framework")]
    unsafe extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn CGRequestPostEventAccess() -> bool;
        fn CGPreflightPostEventAccess() -> bool;
        fn CGGetActiveDisplayList(max:u32, ids:*mut u32, count:*mut u32) -> i32;
        fn CGDisplayBounds(id:u32) -> Rect;
        fn CGEventCreate(source:*const c_void) -> *mut c_void;
        fn CGEventGetLocation(event:*const c_void) -> Point;
        fn CGEventCreateMouseEvent(source:*const c_void, kind:u32, point:Point, button:u32) -> *mut c_void;
        fn CGEventCreateScrollWheelEvent(source:*const c_void, units:u32, count:u32, ...) -> *mut c_void;
        fn CGEventPost(tap:u32,event:*const c_void);
    }
    #[link(name="CoreFoundation",kind="framework")]
    unsafe extern "C" { fn CFRelease(value:*const c_void); }
    pub fn accessibility_trusted() -> bool { unsafe { AXIsProcessTrusted() } }
    pub fn trusted() -> bool { unsafe { CGPreflightPostEventAccess() } }
    pub fn request_access() -> bool { unsafe { CGRequestPostEventAccess() }; trusted() }
    pub fn displays() -> Result<Vec<Display>,String> {
        let mut ids=[0u32;32];let mut count=0;
        if unsafe { CGGetActiveDisplayList(32,ids.as_mut_ptr(),&mut count) } != 0 { return Err("Could not read displays".into()); }
        Ok(ids[..count as usize].iter().map(|id| { let r=unsafe {CGDisplayBounds(*id)};Display{id:*id,x:r.origin.x,y:r.origin.y,width:r.size.width,height:r.size.height} }).collect())
    }
    fn post(event:*mut c_void) -> Result<(),String> {
        if event.is_null() { return Err("macOS could not create the input event".into()); }
        unsafe {CGEventPost(0,event);CFRelease(event);} Ok(())
    }
    pub fn move_pointer(id:u32,x:f64,y:f64) -> Result<(),String> {
        if !trusted() {return Err("Allow Handsfree to control your Mac in Privacy & Security settings".into());}
        let display=displays()?.into_iter().find(|d| d.id==id).ok_or("Selected display disconnected")?;
        let (x,y)=point(&display,x,y)?;
        post(unsafe{CGEventCreateMouseEvent(std::ptr::null(),5,Point{x,y},0)})
    }
    pub fn click(right:bool) -> Result<(),String> {
        if !trusted(){return Err("Native input-control access is unavailable".into());}
        let event=unsafe{CGEventCreate(std::ptr::null())};
        if event.is_null(){return Err("Could not read pointer position".into());}
        let location=unsafe{CGEventGetLocation(event)};unsafe{CFRelease(event)};
        let (down,up,button)=if right{(3,4,1)}else{(1,2,0)};
        post(unsafe{CGEventCreateMouseEvent(std::ptr::null(),down,location,button)})?;
        post(unsafe{CGEventCreateMouseEvent(std::ptr::null(),up,location,button)})
    }
    pub fn scroll(amount:i32)->Result<(),String>{
        if !trusted(){return Err("Native input-control access is unavailable".into());}
        post(unsafe{CGEventCreateScrollWheelEvent(std::ptr::null(),1,1,amount.clamp(-10,10))})
    }
}
#[cfg(not(target_os = "macos"))]
mod platform {
    use super::*;
    pub fn accessibility_trusted()->bool{false}
    pub fn trusted()->bool{false}
    pub fn request_access()->bool{false}
    pub fn displays()->Result<Vec<Display>,String>{Ok(vec![])}
    pub fn move_pointer(_:u32,_:f64,_:f64)->Result<(),String>{Err("Native control is currently available on macOS only".into())}
    pub fn click(_:bool)->Result<(),String>{Err("macOS required".into())}
    pub fn scroll(_:i32)->Result<(),String>{Err("macOS required".into())}
}
pub use platform::*;
#[cfg(test)] mod tests {
    use super::*;
    #[test]fn negative_origin_uses_logical_display_space(){let d=Display{id:1,x:-1920.0,y:0.0,width:1920.0,height:1080.0};assert_eq!(point(&d,0.0,0.0).unwrap(),(-1920.0,0.0));assert_eq!(point(&d,1.0,1.0).unwrap(),(-1.0,1079.0));}
    #[test]fn retina_does_not_multiply_by_device_pixel_ratio(){let d=Display{id:1,x:0.0,y:0.0,width:1512.0,height:982.0};assert_eq!(point(&d,1.0,1.0).unwrap(),(1511.0,981.0));}
    #[test]fn rejects_degenerate_monitor(){let d=Display{id:1,x:0.0,y:0.0,width:0.0,height:982.0};assert!(point(&d,0.5,0.5).is_err());}
}
