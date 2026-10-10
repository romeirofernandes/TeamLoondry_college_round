import Foundation
import Speech
import AVFoundation
func emit(_ value: [String: Any]) { if let data = try? JSONSerialization.data(withJSONObject: value), let line = String(data:data, encoding:.utf8) { print(line); fflush(stdout) } }
if CommandLine.arguments.contains("--diagnostics") { emit(["kind":"diagnostics","onDeviceOnly":true,"available":SFSpeechRecognizer(locale:Locale(identifier:"en-US"))?.supportsOnDeviceRecognition ?? false]); exit(0) }
let engine = AVAudioEngine()
var task: SFSpeechRecognitionTask?
var request: SFSpeechAudioBufferRecognitionRequest?
var generation = UUID()
var pending: DispatchWorkItem?
var latest = ""
func fail(_ message: String) { emit(["kind":"error","message":message]); exit(1) }
func finish(_ text:String, _ token:UUID) {
 guard generation == token else { return }
 generation = UUID(); pending?.cancel(); pending = nil
 emit(["kind":"utterance","text":text])
 engine.stop(); engine.inputNode.removeTap(onBus:0)
 request?.endAudio(); task?.cancel(); task = nil; request = nil
 DispatchQueue.main.asyncAfter(deadline:.now()+0.3) { start() }
}
func start() {
 guard let recognizer = SFSpeechRecognizer(locale:Locale(identifier:"en-US")), recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else { fail("On-device English speech is unavailable on this Mac. Use typed commands or install the speech language in macOS."); return }
 let input = engine.inputNode
 let format = input.outputFormat(forBus:0)
 guard format.sampleRate > 0 else { fail("Microphone unavailable."); return }
 let token = UUID(); generation = token; latest = ""
 let capture = SFSpeechAudioBufferRecognitionRequest()
 capture.requiresOnDeviceRecognition = true
 capture.shouldReportPartialResults = true
 request = capture
 input.installTap(onBus:0, bufferSize:1024, format:format) { buffer, _ in capture.append(buffer) }
 engine.prepare()
 do { try engine.start() } catch { fail("Microphone capture failed: \(error.localizedDescription)") }
 task = recognizer.recognitionTask(with:capture) { result, error in
   DispatchQueue.main.async {
     guard generation == token else { return }
     if let result = result {
       let text = result.bestTranscription.formattedString
       if result.isFinal { finish(text,token); return }
       if text != latest {
         latest = text; pending?.cancel()
         let work = DispatchWorkItem { if generation == token && latest == text { finish(text,token) } }
         pending = work; DispatchQueue.main.asyncAfter(deadline:.now()+1.0,execute:work)
       }
     }
     if let error = error { fail("Speech stopped: \(error.localizedDescription)") }
   }
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
