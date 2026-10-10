# Keep vision models local in a classic worker

MediaPipe models and WASM are packaged with the extension and run in a classic worker because their loader uses importScripts. Worker failure freezes pointer activation before a measured lower-rate CPU fallback attempts recovery. A persistent control window owns capture, since a Chrome popup closes during normal browsing. This adds a visible window but avoids fragile capture lifetime and hidden permission requests.
