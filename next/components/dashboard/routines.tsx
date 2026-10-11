"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle, Play, Trash, X } from "@phosphor-icons/react";
import type { RoutineSession, RoutineStep, VoiceRoutine } from "../../../extension/src/shared";
import { emptyRoutineSession } from "../../../extension/src/shared";
import { request } from "@/lib/extension-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";

export function Routines({ running, disabled }: { running: boolean; disabled: boolean }) {
  const [session, setSession] = useState<RoutineSession>(emptyRoutineSession);
  const [routines, setRoutines] = useState<VoiceRoutine[]>([]);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<RoutineStep[]>([]);
  const [editing, setEditing] = useState<string | undefined>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const draftSignature = useRef("");

  const refresh = useCallback(async () => {
    try {
      const [nextSession, nextRoutines] = await Promise.all([
        request<RoutineSession>({ type: "GET_ROUTINE_SESSION" }),
        request<VoiceRoutine[]>({ type: "GET_ROUTINES" }),
      ]);
      setSession(nextSession);
      setRoutines(nextRoutines);
      const nextSignature = nextSession.draft.map(step => step.id).join("|");
      if (!editing && nextSignature !== draftSignature.current) {
        draftSignature.current = nextSignature;
        setSteps(nextSession.draft);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load routines. Reconnect the extension and retry.");
    }
  }, [editing, name]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  function resetEditor() {
    setEditing(undefined);
    setName("");
    setSteps(session.draft);
  }

  function move(index: number, offset: -1 | 1) {
    const next = [...steps];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  }

  async function save() {
    setError(""); setNotice("");
    try {
      const saved = await request<VoiceRoutine | { ok: false; error: string }>({ type: "SAVE_ROUTINE", id: editing, name, steps });
      if ("ok" in saved && saved.ok === false) throw new Error(saved.error);
      setNotice(`Saved “${name.trim()}”.`);
      setEditing(undefined); setName(""); setSteps([]); draftSignature.current = "";
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this routine."); }
  }

  async function discard() {
    setError(""); setNotice("");
    try { await request({ type: "DISCARD_ROUTINE_DRAFT" }); setName(""); setSteps([]); draftSignature.current = ""; setEditing(undefined); setNotice("Draft discarded."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not discard the draft."); }
  }

  async function deleteRoutine(routine: VoiceRoutine) {
    setError(""); setNotice("");
    try { await request({ type: "DELETE_ROUTINE", id: routine.id }); setNotice(`Deleted “${routine.name}”.`); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this routine."); }
  }

  async function sendVoiceCommand(text: string, success: string) {
    setError(""); setNotice("");
    try { await request({ type: "HEARD", text }); setNotice(success); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The routine command could not be sent."); }
  }

  function editRoutine(routine: VoiceRoutine) {
    setEditing(routine.id); setName(routine.name); setSteps(routine.steps.map(step => ({ ...step })));
  }

  const hasDraft = session.draft.length > 0;
  const editorLocked = disabled || session.recording;
  return <section className="dashboard-panel" aria-labelledby="routines-title">
    <div className="dashboard-section-heading">
      <div><h2 id="routines-title">Voice routines</h2><p>Record a task with voice commands, review each step, then save and replay it by name.</p></div>
    </div>
    <div role="status" aria-live="polite" className="dashboard-hint">
      {session.recording ? session.recordingPaused ? `Recording paused · ${session.draft.length} steps captured` : `Recording now · ${session.draft.length} steps captured` : session.playing ? session.feedback || "Routine is running." : session.playbackPaused ? session.feedback || "Routine paused." : session.feedback || "Say “start recording a routine” while Handsfree is running. Then stop recording to review your draft here."}
    </div>
    {!running && <p className="dashboard-hint">Start a Handsfree session before using voice routine commands.</p>}
    <div className="dashboard-actions">
      {!session.recording && !hasDraft && !session.playing && <Button type="button" disabled={disabled || !running} onClick={() => void sendVoiceCommand("start recording a routine", "Routine recording started.")}><Play data-icon="inline-start" aria-hidden="true" />Start recording</Button>}
      {session.recording && <>
        <Button type="button" variant="outline" disabled={disabled || !running} onClick={() => void sendVoiceCommand(session.recordingPaused ? "resume routine recording" : "pause routine recording", session.recordingPaused ? "Recording resumed." : "Recording paused.")}>{session.recordingPaused ? "Resume recording" : "Pause recording"}</Button>
        <Button type="button" disabled={disabled || !running} onClick={() => void sendVoiceCommand("stop recording routine", "Recording stopped. Review your draft below.")}>Stop recording</Button>
      </>}
      {session.playing && <Button type="button" variant="outline" disabled={disabled || !running} onClick={() => void sendVoiceCommand("pause routine", "Routine paused.")}>Pause routine</Button>}
      {session.playbackPaused && <>
        <Button type="button" disabled={disabled || !running} onClick={() => void sendVoiceCommand("resume routine", "Routine resumed.")}>Resume routine</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => void sendVoiceCommand("stop routine", "Routine stopped.")}>Stop routine</Button>
      </>}
    </div>
    <p className="dashboard-hint">Voice: “start recording a routine,” “pause routine recording,” “undo last routine step,” “stop recording routine,” “run [name],” “list my routines,” “pause routine,” “resume routine,” and “stop routine.”</p>
    {(hasDraft || editing) && <div className="dashboard-panel" aria-label="Routine draft editor">
      <FieldGroup>
        <Field><FieldLabel htmlFor="routine-name">Routine name</FieldLabel><Input id="routine-name" value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="For example, Morning reading" disabled={editorLocked} /><FieldDescription>Names stay on this device and must be unique.</FieldDescription></Field>
      </FieldGroup>
      <ol aria-label="Routine steps" className="routine-step-list">
        {steps.map((step, index) => <li key={step.id} className="routine-step-row">
          <div><b>{index + 1}.</b> {step.action.type === "whatsapp-message" ? `Send WhatsApp to ${step.action.recipient.label}` : step.label}
            {step.action.type === "whatsapp-message" && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{step.action.text}</p>}
          </div>
          <div className="routine-step-actions">
            <Button type="button" variant="ghost" size="icon" aria-label={`Move ${step.label} up`} disabled={editorLocked || index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Move ${step.label} down`} disabled={editorLocked || index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${step.label}`} disabled={editorLocked} onClick={() => setSteps(steps.filter(item => item.id !== step.id))}><X aria-hidden="true" /></Button>
          </div>
        </li>)}
      </ol>
      {steps.length === 0 && <p>No steps yet. Record supported actions before saving.</p>}
      {steps.some(step => step.action.type === "whatsapp-message") && <p className="dashboard-hint">Saving this routine authorizes the messages shown above to send automatically each time you run it, without another confirmation. Messages stay on this device. A different unsent draft or an unverified recipient stops playback.</p>}
      <div className="dashboard-actions">
        <Button type="button" disabled={editorLocked || !name.trim() || !steps.length} onClick={() => void save()}><CheckCircle data-icon="inline-start" aria-hidden="true" />{editing ? "Save changes" : "Save routine"}</Button>
        {hasDraft && !editing && <Button type="button" variant="outline" disabled={editorLocked} onClick={() => void discard()}><Trash data-icon="inline-start" aria-hidden="true" />Discard draft</Button>}
        {editing && <Button type="button" variant="outline" onClick={resetEditor}>Cancel editing</Button>}
      </div>
    </div>}
    {!hasDraft && !editing && <p className="dashboard-hint">When you say “stop recording routine,” the captured steps will appear here for review.</p>}
    <div className="dashboard-panel">
      <h3>Saved routines</h3>
      {!routines.length ? <p>No saved routines yet.</p> : <ul className="routine-saved-list">{routines.map(routine => <li key={routine.id} className="routine-step-row">
        <div><b>{routine.name}</b><p>{routine.steps.length} {routine.steps.length === 1 ? "step" : "steps"}</p><ol>{routine.steps.map((step, index) => <li key={step.id}>{index + 1}. {step.action.type === "whatsapp-message" ? `Automatically send WhatsApp to ${step.action.recipient.label}` : step.label}{step.action.type === "whatsapp-message" && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{step.action.text}</p>}</li>)}</ol></div>
        <div className="routine-step-actions">
          <Button type="button" variant="outline" disabled={disabled || !running} onClick={() => void request({ type: "HEARD", text: `run ${routine.name}` }).then(() => setNotice(`Asked Handsfree to run “${routine.name}”.`)).catch(cause => setError(cause instanceof Error ? cause.message : "Could not start routine."))}><Play data-icon="inline-start" aria-hidden="true" />Run</Button>
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => editRoutine(routine)}>Edit</Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete routine ${routine.name}`} disabled={disabled} onClick={() => void deleteRoutine(routine)}><Trash aria-hidden="true" /></Button>
        </div>
      </li>)}</ul>}
    </div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
