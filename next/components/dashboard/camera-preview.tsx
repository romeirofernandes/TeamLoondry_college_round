"use client";

import { useEffect, useRef, useState } from "react";
import { VideoCamera, VideoCameraSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function CameraPreview({
  running,
  voiceOnly = false,
}: {
  running: boolean;
  voiceOnly?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Start a session to see your camera.");
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!running) setEnabled(false);
  }, [running]);
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    setReady(false);
    if (!running || !enabled) {
      setStatus(
        voiceOnly
          ? "Camera stays off. Use voice to choose named items and results."
          : running
            ? "Show a preview to check your position."
            : "Start a session to preview your camera.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera preview requires HTTPS or localhost in Chrome.");
      return;
    }
    setStatus("Connecting camera preview…");
    void navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 400 } },
        audio: false,
      })
      .then((capture) => {
        if (cancelled) {
          capture.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = capture;
        if (video.current) video.current.srcObject = capture;
        setReady(true);
        setStatus("Live preview");
      })
      .catch(() => {
        if (!cancelled)
          setStatus(
            "Camera preview unavailable. Allow camera access to this website, then retry. Extension tracking has its own permission.",
          );
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (video.current) video.current.srcObject = null;
    };
  }, [running, voiceOnly, retry, enabled]);
  return (
    <div
      className={`dashboard-camera${ready ? "" : " dashboard-camera-optional"}`}
    >
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label="Live camera preview"
        hidden={!ready}
      />
      {!ready && (
        <div className="dashboard-camera-empty">
          {running ? (
            <VideoCameraSlash aria-hidden="true" />
          ) : (
            <VideoCamera aria-hidden="true" />
          )}
          <p>{status}</p>
          {running && (
            <Button
              variant="outline"
              onClick={() => {
                setEnabled(true);
                setRetry((value) => value + 1);
              }}
            >
              {enabled ? "Retry preview" : "Show camera preview"}
            </Button>
          )}
        </div>
      )}
      {ready && (
        <div className="dashboard-camera-label">
          Live preview · mirrored{" "}
          <button onClick={() => setEnabled(false)}>Hide preview</button>
        </div>
      )}
    </div>
  );
}
