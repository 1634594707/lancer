import Foundation
import AppKit
import ScreenCaptureKit
import AVFoundation

final class RecordingDelegate: NSObject, SCRecordingOutputDelegate {
    func recordingOutputDidStartRecording(_ output: SCRecordingOutput) {
        print("RECORDING_STARTED")
        fflush(stdout)
    }
    func recordingOutputDidFinishRecording(_ output: SCRecordingOutput) {
        print("RECORDING_FINISHED duration=\(output.recordedDuration.seconds)")
        fflush(stdout)
        exit(0)
    }
    func recordingOutput(_ output: SCRecordingOutput, didFailWithError error: Error) {
        fputs("Recording failed: \(error)\n", stderr)
        exit(1)
    }
}

@main struct Recorder {
    static func main() async throws {
        _ = NSApplication.shared
        let args = CommandLine.arguments
        guard (4...5).contains(args.count), let pid = Int32(args[1]) else {
            fputs("Usage: window-recorder PID OUTPUT.mp4 STOP_FILE\n", stderr)
            exit(2)
        }
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
        guard let window = content.windows.filter({ $0.owningApplication?.processID == pid && $0.frame.width > 800 && $0.frame.height > 500 }).max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) else {
            throw NSError(domain: "Recorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "No main window for owned process"])
        }
        let appCapture = args.count == 5 && args[4] == "--app"
        let display = content.displays.max(by: { $0.frame.intersection(window.frame).width < $1.frame.intersection(window.frame).width })!
        let filter = appCapture
            ? SCContentFilter(display: display, including: [window.owningApplication!], exceptingWindows: [])
            : SCContentFilter(desktopIndependentWindow: window)
        let config = SCStreamConfiguration()
        config.width = Int(window.frame.width * 2) / 2 * 2
        config.height = Int(window.frame.height * 2) / 2 * 2
        if appCapture {
            config.width = display.width * 2
            config.height = display.height * 2
        }
        config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
        config.queueDepth = 6
        config.showsCursor = false
        config.capturesAudio = false
        config.ignoreShadowsSingleWindow = true
        config.captureResolution = .best
        let recordingConfig = SCRecordingOutputConfiguration()
        recordingConfig.outputURL = URL(fileURLWithPath: args[2])
        recordingConfig.outputFileType = .mp4
        recordingConfig.videoCodecType = .h264
        let delegate = RecordingDelegate()
        let output = SCRecordingOutput(configuration: recordingConfig, delegate: delegate)
        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream.addRecordingOutput(output)
        print("CAPTURE width=\(config.width) height=\(config.height) targetFps=60 window=\(window.windowID)")
        try await stream.startCapture()
        while !FileManager.default.fileExists(atPath: args[3]) {
            try await Task.sleep(for: .milliseconds(200))
        }
        try await stream.stopCapture()
        try await Task.sleep(for: .seconds(15))
        fputs("Recording did not finish\n", stderr)
        exit(1)
    }
}
