"""Test the actual DMG installer and installed native WKWebView without input injection."""
import hashlib, json, os, pathlib, subprocess, sys, tempfile, time
package = pathlib.Path(sys.argv[1]).resolve()
report_path = pathlib.Path(sys.argv[2]).resolve()
release = package.parent
installer = release / "install-app.sh"
updater = release / "update-app.sh"
assert installer.is_file() and updater.is_file(), "release must include both tested entry points"
checks = []
def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kwargs)
def record(name):
    checks.append({"name": name, "status": "passed"})
with tempfile.TemporaryDirectory(prefix="handsfree-mac-test-") as temporary:
    temp = pathlib.Path(temporary)
    destination = temp / "Applications with spaces"
    env = dict(os.environ, HANDSFREE_INSTALL_DIR=str(destination), HANDSFREE_NO_LAUNCH="1")
    env.pop("HANDSFREE_ALLOW_UNSIGNED_MAC", None)
    args = ["bash", str(installer), "--local-package", str(package)]
    rejected = subprocess.run(args, env=env, capture_output=True, text=True)
    assert rejected.returncode != 0 and not destination.exists(), rejected.stdout + rejected.stderr
    record("unsigned install requires explicit opt-in")
    env["HANDSFREE_ALLOW_UNSIGNED_MAC"] = "1"
    run(args, env=env)
    app = destination / "Handsfree.app"
    binary = app / "Contents/MacOS/handsfree-desktop"
    assert binary.is_file()
    run(["codesign", "--verify", "--deep", "--strict", str(app)])
    record("DMG install and bundle signature integrity")
    diagnostics = json.loads(run([str(binary), "--diagnostics"]).stdout)
    assert diagnostics["os"] == "macos" and diagnostics["arch"] == "aarch64"
    assert diagnostics["state"] == "stopped" and not diagnostics["cloudSpeech"] and diagnostics["nativeControl"]
    record("installed ARM64 executable starts stopped")
    sentinel = destination / "preferences-sentinel.json"
    sentinel.write_text('{"calibration":"keep","pairing":"keep"}')
    original = sentinel.read_bytes()
    update = ["bash", str(updater), "--local-package", str(package)]
    run(update, env=env)
    assert sentinel.read_bytes() == original
    record("real update entry point preserves adjacent user-data sentinel")
    bad = temp / "bad"
    bad.mkdir()
    (bad / package.name).write_bytes(b"corrupted")
    (bad / "SHA256SUMS").write_text(f'{"0"*64}  {package.name}\n')
    before = hashlib.sha256(binary.read_bytes()).hexdigest()
    result = subprocess.run(["bash", str(installer), "--local-package", str(bad / package.name)], env=env, capture_output=True)
    assert result.returncode != 0 and hashlib.sha256(binary.read_bytes()).hexdigest() == before
    record("checksum failure preserves installed executable")
    ready = temp / "frontend-ready.json"
    ui_env = dict(env, HANDSFREE_SMOKE_REPORT=str(ready), HANDSFREE_SMOKE_HOLD="1")
    process = subprocess.Popen([str(binary)], env=ui_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and not ready.exists() and process.poll() is None:
            time.sleep(0.25)
        assert ready.exists() and process.poll() is None, "Installed app did not render its native WKWebView"
        ui = json.loads(ready.read_text())
        assert ui["frontendReady"] is True
        record("installed native WKWebView renders React and invokes Rust")
        screenshot = report_path.with_name("handsfree-macos-panel.png")
        run(["screencapture", "-x", str(screenshot)])
        image = run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(screenshot)]).stdout
        assert screenshot.stat().st_size > 12000 and "pixelWidth" in image and "pixelHeight" in image, image
        record("live installed Mac panel screenshot captured")
    finally:
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
    assert not list(destination.glob(".Handsfree.*"))
    record("installer leaves no staging or backup directories")
report = {"schemaVersion":1,"artifact":package.name,"sha256":hashlib.sha256(package.read_bytes()).hexdigest(),"checks":checks,"diagnostics":diagnostics,"physicalM4":"pending","cameraTracking":"pending physical device","accessibilityInput":"pending physical device","developerIdSigned":False,"notarized":False}
report_path.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({"passed":len(checks),"artifact":package.name}))
