import Foundation
import Speech
import AVFoundation
func emit(_ value: [String: Any]) { if let data = try? JSONSerialization.data(withJSONObject: value), let line = String(data:data, encoding:.utf8) { print(line); fflush(stdout) } }
if CommandLine.arguments.contains("--diagnostics") { emit(["kind":"diagnostics","onDeviceOnly":true,"available":SFSpeechRecognizer(locale:Locale(identifier:"en-US"))?.supportsOnDeviceRecognition ?? false]); exit(0) }
let engine = AVAudioEngine()
var task: SFSpeechRecognitionTask?
var request: SFSpeechAudioBufferRecognitionRequest?
func fail(_ message: String) { emit(["kind":"error","message":message]); exit(1) }
func start() {
 guard let recognizer = SFSpeechRecognizer(locale:Locale(identifier:"en-US")), recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else { fail("On-device English speech is unavailable on this Mac. Use typed commands or install the speech language in macOS."); return }
 let input = engine.inputNode
 let format = input.outputFormat(forBus:0)
 guard format.sampleRate > 0 else { fail("Microphone unavailable."); return }
 let capture = SFSpeechAudioBufferRecognitionRequest()
 capture.requiresOnDeviceRecognition = true
 capture.shouldReportPartialResults = false
 request = capture
 input.installTap(onBus:0, bufferSize:1024, format:format) { buffer, _ in capture.append(buffer) }
 engine.prepare()
 do { try engine.start() } catch { fail("Microphone capture failed: \(error.localizedDescription)") }
 task = recognizer.recognitionTask(with:capture) { result, error in
   if let result = result, result.isFinal { emit(["kind":"utterance","text":result.bestTranscription.formattedString]); engine.stop(); input.removeTap(onBus:0); task = nil; request = nil; DispatchQueue.main.asyncAfter(deadline:.now()+0.3) { start() }; }
   if let error = error { fail("Speech stopped: \(error.localizedDescription)") }
 }
 emit(["kind":"ready"])
}
SFSpeechRecognizer.requestAuthorization { status in
 guard status == .authorized else { fail("Allow Speech Recognition for Handsfree in Privacy & Security."); return }
 AVCaptureDevice.requestAccess(for:.audio) { granted in
   guard granted else { fail("Allow Microphone access for Handsfree in Privacy & Security."); return }
   DispatchQueue.main.async { start() }
 }
}
RunLoop.main.run()
