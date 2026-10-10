# Keep vision models local in a classic worker

MediaPipe models and WASM are packaged with the extension and run in a classic worker because their loader uses importScripts. Worker failure freezes pointer activation before a measured lower-rate CPU fallback attempts recovery. A persistent control window owns capture, since a Chrome popup closes during normal browsing. This adds a visible window but avoids fragile capture lifetime and hidden permission requests.

## Superseded capture owner, 2026-10-10

The latest user request moves controls into the website and keeps the popup minimal. Chrome offscreen capture now owns tracking and speech; the visible popup owns only its preview. Raw camera frames replace dependence on displayed-video playback where supported. A starvation regression freezes the video clock while the camera keeps producing frames and verifies inference continues.
