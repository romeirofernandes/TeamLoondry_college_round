use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase { #[default] Stopped, Running, Paused }
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { pub phase: Phase, pub epoch: u64, pub reason: String, pub display_id: u32 }
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Sample { pub epoch: u64, pub sequence: u64, pub x: f64, pub y: f64, pub confidence: f64, pub age_ms: f64 }
#[derive(Debug)]
pub struct Session {
    pub snapshot: Snapshot,
    last_sequence: u64,
    heartbeat: Instant,
    frame: Option<Instant>,
    last_click: Option<Instant>,
}
impl Default for Session {
    fn default() -> Self { Self { snapshot: Snapshot { phase: Phase::Stopped, epoch: 0, reason: "Ready when you are".into(), display_id: 0 }, last_sequence: 0, heartbeat: Instant::now(), frame: None, last_click: None } }
}
impl Session {
    pub fn start(&mut self, display_id: u32, now: Instant) -> Snapshot {
        self.snapshot.epoch += 1;
        self.snapshot.phase = Phase::Running;
        self.snapshot.reason = "Tracking active".into();
        self.snapshot.display_id = display_id;
        self.last_sequence = 0; self.frame = None; self.last_click = None; self.heartbeat = now;
        self.snapshot.clone()
    }
    pub fn pause(&mut self, reason: &str) -> Snapshot {
        if self.snapshot.phase != Phase::Stopped { self.snapshot.phase = Phase::Paused; }
        self.snapshot.epoch += 1; self.frame = None;
        self.snapshot.reason = reason.into(); self.snapshot.clone()
    }
    pub fn stop(&mut self) -> Snapshot {
        self.snapshot.phase = Phase::Stopped; self.snapshot.epoch += 1; self.frame = None;
        self.snapshot.reason = "Camera off".into(); self.snapshot.clone()
    }
    pub fn heartbeat(&mut self, epoch: u64, now: Instant) -> Result<(), String> {
        if epoch != self.snapshot.epoch { return Err("Session changed".into()); }
        self.heartbeat = now; Ok(())
    }
    pub fn watchdog(&mut self, now: Instant) -> bool {
        if self.snapshot.phase == Phase::Running && now.saturating_duration_since(self.heartbeat) > Duration::from_secs(2) {
            self.pause("Tracking window stopped responding. Resume when ready."); return true;
        }
        false
    }
    pub fn sample(&mut self, sample: &Sample, now: Instant) -> Result<bool, String> {
        if self.snapshot.phase != Phase::Running || sample.epoch != self.snapshot.epoch { return Err("Session is not running or has changed".into()); }
        if self.watchdog(now) { return Err("Tracking heartbeat expired".into()); }
        if sample.sequence <= self.last_sequence { return Err("Old tracking sample".into()); }
        self.last_sequence = sample.sequence;
        if ![sample.x, sample.y, sample.confidence, sample.age_ms].iter().all(|v| v.is_finite()) || !(0.0..=150.0).contains(&sample.age_ms) || !(0.0..=1.0).contains(&sample.x) || !(0.0..=1.0).contains(&sample.y) || !(0.7..=1.0).contains(&sample.confidence) {
            self.frame = None; return Ok(false);
        }
        self.frame = Some(now); Ok(true)
    }
    pub fn activation(&mut self, epoch: u64, now: Instant, click: bool) -> Result<(), String> {
        if self.snapshot.phase != Phase::Running || epoch != self.snapshot.epoch || self.watchdog(now) { return Err("Resume tracking before acting".into()); }
        if self.frame.is_none_or(|t| now.saturating_duration_since(t) > Duration::from_millis(200)) { return Err("Wait for a fresh, confident tracking sample".into()); }
        if click {
            if self.last_click.is_some_and(|t| now.saturating_duration_since(t) < Duration::from_millis(800)) { return Err("Click already handled".into()); }
            self.last_click = Some(now);
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample(epoch: u64, sequence: u64) -> Sample { Sample { epoch, sequence, x: 0.5, y: 0.5, confidence: 0.9, age_ms: 10.0 } }
    #[test] fn stopped_is_default_and_blocks_actions() { let mut s = Session::default(); assert_eq!(s.snapshot.phase, Phase::Stopped); assert!(s.activation(0, Instant::now(), true).is_err()); }
    #[test] fn pause_invalidates_inflight_sample() { let mut s = Session::default(); let t=Instant::now(); let epoch=s.start(1,t).epoch; s.pause("Pause"); assert!(s.sample(&sample(epoch,1),t).is_err()); }
    #[test] fn duplicate_sequence_cannot_move_pointer() { let mut s=Session::default(); let t=Instant::now(); let e=s.start(1,t).epoch; assert!(s.sample(&sample(e,1),t).unwrap()); assert!(s.sample(&sample(e,1),t).is_err()); }
    #[test] fn loss_clears_click_authorization() { let mut s=Session::default(); let t=Instant::now(); let e=s.start(1,t).epoch; s.sample(&sample(e,1),t).unwrap(); let mut lost=sample(e,2); lost.confidence=0.0; assert!(!s.sample(&lost,t).unwrap()); assert!(s.activation(e,t,true).is_err()); }
    #[test] fn old_frames_cannot_click() { let mut s=Session::default(); let t=Instant::now(); let e=s.start(1,t).epoch; s.sample(&sample(e,1),t).unwrap(); assert!(s.activation(e,t+Duration::from_millis(201),true).is_err()); }
    #[test] fn expired_heartbeat_pauses_native_gate() { let mut s=Session::default(); let t=Instant::now(); let e=s.start(1,t).epoch; assert!(s.sample(&sample(e,1),t+Duration::from_secs(3)).is_err()); assert_eq!(s.snapshot.phase,Phase::Paused); }
    #[test] fn invalid_numbers_and_bounds_never_authorize() { for value in [f64::NAN,f64::INFINITY,-0.1,1.1] { let mut s=Session::default();let t=Instant::now();let e=s.start(1,t).epoch;let mut p=sample(e,1);p.x=value; assert!(!s.sample(&p,t).unwrap());assert!(s.activation(e,t,true).is_err()); } }
    #[test] fn stale_renderer_sample_is_rejected() { let mut s=Session::default();let t=Instant::now();let e=s.start(1,t).epoch;let mut p=sample(e,1);p.age_ms=151.0;assert!(!s.sample(&p,t).unwrap()); }
    #[test] fn repeated_click_is_suppressed() { let mut s=Session::default();let t=Instant::now();let e=s.start(1,t).epoch;s.sample(&sample(e,1),t).unwrap();assert!(s.activation(e,t,true).is_ok());assert!(s.activation(e,t,true).is_err()); }
    #[test] fn stopped_cannot_be_resumed_by_old_heartbeat() { let mut s=Session::default();let t=Instant::now();let e=s.start(1,t).epoch;s.stop();assert!(s.heartbeat(e,t).is_err());assert_eq!(s.snapshot.phase,Phase::Stopped); }
}
