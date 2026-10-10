"use client";

import { useEffect, useRef, useState } from "react";
import { VideoCamera, VideoCameraSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function CameraPreview({ running }: { running: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Start a session to see your camera.");
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    setReady(false);
    if (!running) {
      setStatus("Start a session to see your camera.");
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
  }, [running, retry]);
  return (
    <div className="dashboard-camera">
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
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry preview
            </Button>
          )}
        </div>
      )}
      {ready && (
        <span className="dashboard-camera-label">Live preview · mirrored</span>
      )}
    </div>
  );
}
