import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Camera, Hand, ScanFace, Pause, Play, Square, Settings2, ArrowUpRight, Check, RotateCcw, ShieldCheck } from "lucide-react";
import { Tracker } from "./tracker";
import { PointerFilter, type RawPoint } from "./math";
import { calibrationFromPoses,calibrationStages,type CalibrationStage } from "./calibration";
import { readPreferences,type Preferences,type Session,type Status } from "./types";
import "./style.css";
const stopped:Session={phase:"stopped",epoch:0,reason:"Ready when you are",displayId:0};
const preview:Status={session:stopped,capabilities:{version:"0.1.0",os:"preview",arch:"preview",nativeControl:false,inputAccess:false,accessibilityApi:false,displays:[]}};
function App(){
  const [status,setStatus]=useState<Status>(preview),[session,setSession]=useState<Session>(stopped);
  const [prefs,setPrefs]=useState<Preferences>(()=>readPreferences(localStorage.getItem("handsfree-desktop-v1")));
  const [advanced,setAdvanced]=useState(false),[camera,setCamera]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [confidence,setConfidence]=useState(0),[fps,setFps]=useState(0),[stage,setStage]=useState<CalibrationStage|null>(null),[progress,setProgress]=useState(0),[displayId,setDisplayId]=useState(0);
  const video=useRef<HTMLVideoElement>(null),tracker=useRef(new Tracker()),filter=useRef(new PointerFilter());
  const current=useRef(session),settings=useRef(prefs),generation=useRef(0),sequence=useRef(0),sending=useRef(false);
  const calibration=useRef<{started:number;poses:Record<CalibrationStage,RawPoint[]>}|null>(null);
  const dwell=useRef<{x:number;y:number;since:number;fired:boolean}|null>(null);
  const apply=(s:Session)=>{current.current=s;setSession(s);dwell.current=null;filter.current.reset();};
  const save=(p:Preferences)=>{settings.current=p;setPrefs(p);localStorage.setItem("handsfree-desktop-v1",JSON.stringify({version:1,...p}));};
  const fail=(e:unknown)=>setError(e instanceof Error?e.message:String(e));
  const stop=async()=>{generation.current++;calibration.current=null;setStage(null);setBusy(false);tracker.current.stop();setCamera(false);setConfidence(0);dwell.current=null;if(isTauri())apply(await invoke<Session>("control",{action:"stop"}));else apply(stopped);};
  const pause=async()=>{dwell.current=null;if(isTauri())apply(await invoke<Session>("control",{action:"pause"}));};
  useEffect(()=>{
    let alive=true;
    const refresh=async()=>{if(!isTauri())return;try{const s=await invoke<Status>("status");if(!alive)return;setStatus(s);setDisplayId(id=>id||s.capabilities.displays[0]?.id||0);if(s.session.epoch!==current.current.epoch)apply(s.session);}catch(e){if(alive)fail(e);}};
    void refresh();const timer=setInterval(()=>{void refresh();if(current.current.phase==="running")void invoke("heartbeat",{epoch:current.current.epoch}).catch(fail);},500);
    const unlisten=isTauri()?listen<Session>("session",e=>apply(e.payload)):Promise.resolve(()=>{});
    const unerror=isTauri()?listen<string>("native-error",e=>setError(e.payload)):Promise.resolve(()=>{});
    // Called only after the real React tree commits in the packaged WKWebView.
    if(isTauri())void invoke("frontend_ready").catch(fail);
    return()=>{alive=false;clearInterval(timer);void unlisten.then(f=>f());void unerror.then(f=>f());tracker.current.stop();};
  },[]);
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")void pause();};window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape);},[]);
  const onPoint=(point:RawPoint|null,time:number)=>{
    setConfidence(point?.confidence??0);
    const c=calibration.current;
    if(c){
      const elapsed=performance.now()-c.started,index=Math.floor(elapsed/3000);
      if(index>=5){calibration.current=null;setStage(null);try{const result=calibrationFromPoses(c.poses,settings.current.mode);save({...settings.current,calibrations:{...settings.current.calibrations,[settings.current.mode]:result}});filter.current.setCalibration(result);setError("");}catch(e){fail(e);}return;}
      const pose=calibrationStages[index];setStage(pose);setProgress((elapsed%3000)/3000);
      if(elapsed%3000>1200&&point&&point.confidence>=0.7)c.poses[pose].push(point);
      return;
    }
    const s=current.current;if(s.phase!=="running"||sending.current)return;
    const p=settings.current;const mapped=filter.current.update(point,time,{pointerMode:p.mode,confidenceThreshold:0.7,deadZone:0.035,sensitivity:p.sensitivity,handSensitivity:p.sensitivity});
    const epoch=s.epoch;sending.current=true;
    void invoke("pointer",{sample:{epoch,sequence:++sequence.current,x:mapped.x,y:mapped.y,confidence:mapped.confidence,ageMs:Math.max(0,performance.now()-time)}}).then(async()=>{
      if(current.current.epoch!==epoch||current.current.phase!=="running")return;
      if(mapped.confidence<0.7){dwell.current=null;return;}
      if(!p.dwell){dwell.current=null;return;}
      const d=dwell.current;
      if(!d||Math.hypot(mapped.x-d.x,mapped.y-d.y)>0.018){dwell.current={x:mapped.x,y:mapped.y,since:performance.now(),fired:false};return;}
      if(!d.fired&&performance.now()-d.since>=1200){d.fired=true;await invoke("dwell_click",{epoch});}
    }).catch(e=>{fail(e);void pause();}).finally(()=>{sending.current=false;});
  };
  const startCamera=async()=>{
    if(camera)return;
    if(!video.current)throw new Error("Camera preview is unavailable");
    let count=0,at=performance.now();
    await tracker.current.start(video.current,settings.current.mode,(p,t)=>{count++;if(performance.now()-at>1000){setFps(count);count=0;at=performance.now();}onPoint(p,t);},message=>{setError(message);void pause();});
    setCamera(true);
  };
  const calibrate=async()=>{
    setError("");setBusy(true);const token=++generation.current;
    try{await pause();await startCamera();if(generation.current!==token)return;calibration.current={started:performance.now(),poses:{center:[],left:[],right:[],up:[],down:[]}};setStage("center");setProgress(0);}
    catch(e){tracker.current.stop();setCamera(false);fail(e);}finally{if(generation.current===token)setBusy(false);}
  };
  const start=async()=>{
    setError("");setBusy(true);const token=++generation.current;
    try{const c=settings.current.calibrations[settings.current.mode];if(!c)throw new Error("Calibrate your selected movement first.");await startCamera();if(generation.current!==token)return;filter.current.setCalibration(c);sequence.current=0;apply(await invoke<Session>("start",{displayId}));}
    catch(e){fail(e);}finally{if(generation.current===token)setBusy(false);}
  };
  const switchMode=async(mode:Preferences["mode"])=>{await stop();save({...settings.current,mode});};
  const running=session.phase==="running";
  const calibrated=Boolean(prefs.calibrations[prefs.mode]);
  return <main>
    <header><div className="brand"><span className="mark">h</span><span>handsfree<span className="edition">FOR MAC</span></span></div><button className="icon" aria-label="Preferences" aria-expanded={advanced} onClick={()=>setAdvanced(!advanced)}><Settings2 size={19}/></button></header>
    <section className="intro"><div className="eyebrow"><span className={`dot ${running?"live":""}`}/>{running?"YOU'RE IN CONTROL":session.phase==="paused"?"TAKE YOUR TIME":"YOUR SPACE. YOUR PACE."}</div><h1>{running?"Move naturally.":session.phase==="paused"?"A moment to pause.":"A little movement.\nA lot more freedom."}</h1><p>{running?"Your movement is guiding the Mac pointer.":"Control your Mac with comfortable head or hand movement."}</p></section>
    <div className="modes" role="group" aria-label="Pointer source"><button disabled={busy||!!stage} className={prefs.mode==="face"?"selected":""} onClick={()=>void switchMode("face").catch(fail)}><ScanFace size={19}/>Head<Check className="check" size={15}/></button><button disabled={busy||!!stage} className={prefs.mode==="hand"?"selected":""} onClick={()=>void switchMode("hand").catch(fail)}><Hand size={19}/>Hand<Check className="check" size={15}/></button></div>
    <section className={`preview ${camera?"active":""}`} aria-label="Local camera preview"><video ref={video} muted playsInline/><div className="preview-caption"><span><ShieldCheck size={13}/> Stays on your Mac</span>{camera&&<span>{fps} fps</span>}</div>{!camera&&<div className="camera-empty"><Camera size={28}/><span>Your camera is off</span><small>It starts when you calibrate or resume.</small></div>}{stage&&<div className="calibration"><span className="eyebrow">CALIBRATION · {calibrationStages.indexOf(stage)+1} / 5</span><strong>{stage==="center"?"Rest comfortably":`Move gently ${stage}`}</strong><span>Hold still. Stay within a comfortable range.</span><progress value={progress} max={1}/></div>}</section>
    <div className="status-row" role="status"><span className={`dot ${camera&&confidence>=0.7?"live":""}`}/><span>{stage?"Learning your movement":camera?(confidence>=0.7?"Movement found":"Move into view"):session.reason}</span><span className="status-meta">{calibrated?"Calibrated":"Setup needed"}</span></div>
    {!status.capabilities.nativeControl&&<p className="notice">Mac native control is available in the installed macOS app. This is a UI preview.</p>}
    {status.capabilities.nativeControl&&!status.capabilities.inputAccess&&<div className="notice"><strong>Allow control of your Mac</strong><p>Allow Handsfree to control your Mac when macOS asks.</p><button onClick={()=>void invoke<boolean>("request_access").then(granted=>granted?undefined:invoke("open_help",{kind:"accessibility"})).catch(fail)}>Allow control access <ArrowUpRight size={14}/></button></div>}
    {error&&<div className="error" role="alert">{error}<button onClick={()=>setError("")} aria-label="Dismiss error">×</button></div>}
    <div className="actions"><button className="primary" disabled={busy||!!stage||!status.capabilities.nativeControl||!status.capabilities.inputAccess} onClick={()=>void (running?pause():calibrated?start():calibrate()).catch(fail)}>{running?<Pause size={18}/>:calibrated?<Play size={18}/>:<ScanFace size={18}/>} {busy?"Preparing…":running?"Pause":calibrated?"Start control":"Calibrate & set up"}</button><button className="stop" disabled={!camera&&!busy} onClick={()=>void stop().catch(fail)}><Square size={17}/>Stop</button></div>
    {stage&&<button className="text-button" onClick={()=>void stop().catch(fail)}>Cancel calibration</button>}
    <p className="shortcut">Pause anytime with <kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd></p>
    {advanced&&<section className="preferences"><h2>Make it comfortable</h2><label>Sensitivity <output>{prefs.sensitivity.toFixed(1)}×</output><input type="range" min="0.2" max="4" step="0.1" value={prefs.sensitivity} onChange={e=>save({...prefs,sensitivity:Number(e.target.value)})}/></label><label className="toggle"><input type="checkbox" checked={prefs.dwell} onChange={e=>{dwell.current=null;save({...prefs,dwell:e.target.checked});}}/><span>Click after holding still<small>Hold 1.2 seconds. Move away to click again. Start in an empty test document.</small></span></label><label>Control display<select disabled={running} value={displayId} onChange={e=>setDisplayId(Number(e.target.value))}>{status.capabilities.displays.map((d,i)=><option key={d.id} value={d.id}>Display {i+1} · {d.width} × {d.height}</option>)}</select></label><button className="secondary" disabled={busy||!!stage} onClick={()=>void calibrate().catch(fail)}><RotateCcw size={16}/>Recalibrate</button><p className="hint">Click: ⌘⇧Space · Scroll: ⌘⇧↑ / ↓<br/>Voice and coordinated extension control are coming in the next milestone.</p></section>}
    <footer><span>macOS preview · {status.capabilities.version}</span><button onClick={()=>void invoke("open_help",{kind:"dashboard"}).catch(fail)}>Browser dashboard <ArrowUpRight size={13}/></button></footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
