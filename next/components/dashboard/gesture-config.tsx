"use client";

import { useEffect, useMemo, useState } from "react";
import { Hand, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { GestureAction, GestureCalibration, GesturePreset, GestureRuntimeStatus, HandGesture } from "../../../extension/src/shared";
import { gestureChoices } from "../../../extension/src/gestures";
import { request } from "@/lib/extension-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

type Destination = { id: string; label: string; url: string; source: string };
const actionChoices: { id: GestureAction["type"]; label: string }[] = [
  { id: "open-site", label: "Open a website" },
  { id: "media-toggle", label: "Play or pause media" },
  { id: "media-play", label: "Play media" },
  { id: "media-pause", label: "Pause media" },
  { id: "back", label: "Go back a page" },
  { id: "forward", label: "Go forward a page" },
  { id: "next-tab", label: "Go to the next tab" },
  { id: "previous-tab", label: "Go to the previous tab" },
  { id: "scroll-top", label: "Scroll to the top" },
  { id: "scroll-bottom", label: "Scroll to the bottom" },
];
const gestureLabel = (gesture: HandGesture) => gestureChoices.find(item => item.id === gesture)?.label || gesture;
const actionLabel = (action: GestureAction, destinations: Destination[] = []) => action.type === "open-site" ? `Open ${destinations.find(item => item.id === action.destinationId)?.label || action.destinationId.replace(/^(site|tab):/, "")}` : actionChoices.find(item => item.id === action.type)?.label || "Browser action";

export function GestureConfig({ running, voiceOnly, tabsPermission, onNeedTabs }: { running: boolean; voiceOnly: boolean; tabsPermission: boolean; onNeedTabs: () => void }) {
  const [presets, setPresets] = useState<GesturePreset[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [status, setStatus] = useState<GestureRuntimeStatus>({ ready: false, detected: null, confidence: 0 });
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [gesture, setGesture] = useState<HandGesture>("index");
  const [actionType, setActionType] = useState<GestureAction["type"]>("open-site");
  const [destinationId, setDestinationId] = useState("");
  const [inNewTab, setInNewTab] = useState(true);
  const [name, setName] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [calibration, setCalibration] = useState<GestureCalibration | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const [saved, choices, runtime] = await Promise.all([
      request<GesturePreset[]>({ type: "GET_GESTURE_PRESETS" }),
      request<Destination[]>({ type: "GET_GESTURE_DESTINATIONS" }),
      request<GestureRuntimeStatus>({ type: "GET_GESTURE_STATUS" }),
    ]);
    setPresets(saved || []);
    setDestinations(choices || []);
    setStatus(runtime || { ready: false, detected: null, confidence: 0 });
  }
  useEffect(() => { void refresh().catch(cause => setError(cause instanceof Error ? cause.message : "Could not load gesture presets.")); }, []);
  useEffect(() => {
    if (!running) return;
    let active = true;
    const poll = async () => {
      try {
        const [next, frame] = await Promise.all([
          request<GestureRuntimeStatus>({ type: "GET_GESTURE_STATUS" }),
          calibrating ? request<string | null>({ type: "GET_GESTURE_PREVIEW" }) : Promise.resolve(null),
        ]);
        if (active) {
          setStatus(next);
          if (calibrating) setPreviewFrame(frame);
          if (calibrating && next.calibration) { setCalibration(next.calibration); setCalibrating(false); setPreviewFrame(null); setNotice("Gesture calibrated. Test it, then save your preset."); }
          else if (calibrating && next.error) { setCalibrating(false); setPreviewFrame(null); setError(next.error); }
        }
      } catch { /* Keep the last local status while the extension reconnects. */ }
    };
    void poll();
    const timer = setInterval(() => void poll(), calibrating ? 200 : 350);
    return () => { active = false; clearInterval(timer); };
  }, [running, calibrating]);
  useEffect(() => {
    if (!running) { setCalibrating(false); setPreviewFrame(null); }
  }, [running]);

  const selectedDestination = destinations.find(item => item.id === destinationId);
  const visibleDestinations = useMemo(() => destinations.filter(item => item.label.toLowerCase().includes(siteSearch.trim().toLowerCase())).slice(0, 12), [destinations, siteSearch]);
  const usedGestures = new Set(presets.filter(item => item.id !== editing).map(item => item.gesture));
  const readyForCalibration = running && !voiceOnly;

  function resetForm() {
    setEditing(null); setGesture("index"); setActionType("open-site"); setDestinationId(""); setInNewTab(true); setName(""); setSiteSearch(""); setCalibration(null); setCalibrating(false); setPreviewFrame(null); setError(""); setNotice("");
    void request({ type: "CANCEL_GESTURE_CALIBRATION" }).catch(() => {});
  }
  function editPreset(preset: GesturePreset) {
    setEditing(preset.id); setGesture(preset.gesture); setActionType(preset.action.type); setName(preset.name); setCalibration(null); setCalibrating(false); setPreviewFrame(null); setError(""); setNotice("");
    if (preset.action.type === "open-site") { setDestinationId(preset.action.destinationId); setInNewTab(preset.action.inNewTab); }
  }
  async function saveAll(next: GesturePreset[], success: string): Promise<boolean> {
    setBusy(true); setError("");
    try { const saved = await request<GesturePreset[]>({ type: "SAVE_GESTURE_PRESETS", presets: next }); setPresets(saved); setNotice(success); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save gesture presets."); return false; }
    finally { setBusy(false); }
  }
  async function beginCalibration() {
    setError(""); setNotice(""); setCalibration(null); setPreviewFrame(null); setCalibrating(true);
    try { await request({ type: "CALIBRATE_GESTURE", gesture }); }
    catch (cause) { setCalibrating(false); setError(cause instanceof Error ? cause.message : "Could not start camera calibration."); }
  }
  async function savePreset() {
    if (!calibration) { setError("Calibrate and test this pose before saving it."); return; }
    if (actionType === "open-site" && !selectedDestination) { setError("Choose a website by name first."); return; }
    if (usedGestures.has(gesture)) { setError("That gesture already has a preset. Edit or remove its existing preset first."); return; }
    const action: GestureAction = actionType === "open-site" && selectedDestination
      ? { type: "open-site", destinationId: selectedDestination.id, url: selectedDestination.url, inNewTab }
      : { type: actionType } as GestureAction;
    const preset: GesturePreset = { id: editing || crypto.randomUUID(), name: name.trim() || `${gestureLabel(gesture)} · ${actionLabel(action)}`, gesture, action, calibration, enabled: editing ? presets.find(item => item.id === editing)?.enabled ?? true : true };
    const next = editing ? presets.map(item => item.id === editing ? preset : item) : [...presets, preset];
    if (await saveAll(next, editing ? "Gesture preset updated." : "Gesture preset saved and enabled.")) resetForm();
  }
  async function togglePreset(preset: GesturePreset, enabled: boolean) {
    await saveAll(presets.map(item => item.id === preset.id ? { ...item, enabled } : item), enabled ? "Gesture shortcut enabled." : "Gesture shortcut paused.");
  }
  async function deletePreset(preset: GesturePreset) {
    await saveAll(presets.filter(item => item.id !== preset.id), "Gesture preset deleted.");
    if (editing === preset.id) resetForm();
  }

  return <div className="dashboard-two-column gesture-layout">
    <section className="dashboard-panel">
      <div className="dashboard-section-heading"><div><h2>Your gesture shortcuts</h2><p>Assign a comfortable hand pose to one browser or media action.</p></div><Button disabled={busy || presets.length >= 5} onClick={resetForm}><Plus aria-hidden="true" /> Add preset</Button></div>
      {presets.length ? <ul className="gesture-preset-list">{presets.map(preset => <li key={preset.id}>
        <div className="gesture-preset-icon"><Hand aria-hidden="true" /><span>{gestureLabel(preset.gesture)}</span></div>
        <div className="gesture-preset-info"><strong>{preset.name}</strong><span>{actionLabel(preset.action, destinations)}{preset.action.type === "open-site" ? ` · ${new URL(preset.action.url).hostname}` : ""}</span></div>
        <Switch aria-label={`Enable ${preset.name}`} checked={preset.enabled} disabled={busy} onCheckedChange={checked => void togglePreset(preset, checked)} />
        <Button aria-label={`Edit ${preset.name}`} variant="ghost" size="icon" disabled={busy} onClick={() => editPreset(preset)}><PencilSimple aria-hidden="true" /></Button>
        <Button aria-label={`Delete ${preset.name}`} variant="ghost" size="icon" disabled={busy} onClick={() => void deletePreset(preset)}><Trash aria-hidden="true" /></Button>
      </li>)}</ul> : <div className="gesture-empty"><Hand aria-hidden="true" /><strong>No gesture shortcuts yet</strong><p>Set one up below. Your existing pointer gestures stay separate.</p></div>}
      <p className="dashboard-hint">{running && !voiceOnly ? status.ready ? status.detected ? `Camera sees: ${gestureLabel(status.detected)}.` : "Gesture camera is ready. Hold a pose during calibration." : status.error || "Select “Load model & calibrate” when you’re ready; recognition stays local." : voiceOnly && running ? "Gesture shortcuts need the camera; this session is voice-only." : "Start a camera session to calibrate and use gesture shortcuts."}</p>
    </section>
    <section className="dashboard-panel">
      <div className="dashboard-section-heading"><div><h2>{editing ? "Edit a preset" : "Create a preset"}</h2><p>Choose a pose, choose what it does, then calibrate it on camera.</p></div></div>
      <label className="gesture-field" htmlFor="gesture-preset-name">Preset name <Input id="gesture-preset-name" value={name} maxLength={48} placeholder="e.g. Pause what’s playing" onChange={event => setName(event.target.value)} /></label>
      <label className="gesture-field" htmlFor="gesture-pose">When I show <select id="gesture-pose" value={gesture} disabled={calibrating} onChange={event => { setGesture(event.target.value as HandGesture); setCalibration(null); }}>
        {gestureChoices.map(choice => <option key={choice.id} value={choice.id} disabled={usedGestures.has(choice.id)}>{choice.label}{usedGestures.has(choice.id) ? " · already assigned" : ""}</option>)}
      </select><span className="dashboard-hint">{gestureChoices.find(item => item.id === gesture)?.hint} Open palm is reserved for existing hand-pointer control.</span></label>
      <label className="gesture-field" htmlFor="gesture-action">Do this <select id="gesture-action" value={actionType} disabled={calibrating} onChange={event => { setActionType(event.target.value as GestureAction["type"]); setCalibration(null); }}>
        {actionChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select></label>
      {actionType === "open-site" && <div className="gesture-destination-picker">
        <label className="gesture-field" htmlFor="gesture-site-search">Choose a website by name<Input id="gesture-site-search" value={siteSearch} placeholder="Search sites or open tabs" onChange={event => setSiteSearch(event.target.value)} /></label>
        <div className="gesture-destinations" role="radiogroup" aria-label="Website destinations">
          {visibleDestinations.map(item => <button type="button" key={item.id} disabled={calibrating} data-selected={destinationId === item.id} onClick={() => { setDestinationId(item.id); setCalibration(null); }} role="radio" aria-checked={destinationId === item.id}><strong>{item.label}</strong><small>{item.source === "open-tab" ? "Open tab" : "Suggested site"}</small></button>)}
          {!visibleDestinations.length && <p>No matching suggestions. Choose from an open tab or supported site.</p>}
        </div>
        {!tabsPermission && <div className="gesture-permission"><p>Want to use a site that’s already open? Enable tab access to add your open websites to this picker.</p><Button variant="outline" onClick={onNeedTabs}>Enable tab access</Button></div>}
        <label className="gesture-check"><input type="checkbox" checked={inNewTab} onChange={event => setInNewTab(event.target.checked)} /> Open it in a new tab</label>
      </div>}
      <div className="gesture-calibration-box">
        <div><strong>Camera calibration</strong><p>{calibrating ? `Hold ${gestureLabel(gesture).toLowerCase()} steadily. The camera will confirm when it has a stable sample.` : calibration ? "Calibration captured. You can save the preset." : "Keep your hand comfortably in frame and palm facing the camera."}</p></div>
        {calibrating && <div className="gesture-live-preview">
          {previewFrame ? <img src={previewFrame} alt="Live mirrored camera feed during gesture calibration" /> : <div className="gesture-preview-wait" role="status">Opening camera preview…</div>}
          <span className="gesture-preview-label">Live camera · frames stay on this device</span>
        </div>}
        {calibrating && <Progress value={(status.calibrationProgress || 0) * 100} aria-label="Gesture calibration progress" />}
        {status.calibrating && <p className="gesture-detected" role="status">Detected: {status.detected ? gestureLabel(status.detected) : "looking for your pose"}</p>}
        <div className="dashboard-actions"><Button variant="outline" disabled={!readyForCalibration || busy || calibrating} onClick={() => void beginCalibration()}>{calibrating ? "Calibrating…" : calibration ? "Calibrate again" : status.ready ? "Calibrate this gesture" : "Load model & calibrate"}</Button>{calibrating && <Button variant="ghost" onClick={() => { setCalibrating(false); setPreviewFrame(null); void request({ type: "CANCEL_GESTURE_CALIBRATION" }).catch(() => {}); }}>Cancel</Button>}</div>
      </div>
      {error && <p role="alert" className="gesture-error">{error}</p>}{notice && <p role="status" className="gesture-notice">{notice}</p>}
      <div className="dashboard-actions"><Button disabled={busy || calibrating || !calibration || actionType === "open-site" && !selectedDestination || presets.length >= 5 && !editing} onClick={() => void savePreset()}>{editing ? "Save changes" : "Save preset"}</Button>{editing && <Button variant="ghost" onClick={resetForm}>Cancel edit</Button>}</div>
      <p className="dashboard-hint">Presets and calibration are stored locally. Camera frames stay on this device. Hold a pose briefly, then return to neutral to trigger it once.</p>
    </section>
  </div>;
}
