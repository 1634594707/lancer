// macOS evidence utility: encode actual Electron PNG captures, or decode exact sample frames.
import Foundation
import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
func readExactly(_ count: Int) -> Data? {
    var result = Data()
    while result.count < count {
        guard let part = try? FileHandle.standardInput.read(upToCount: count - result.count), !part.isEmpty else {
            if result.isEmpty { return nil }
            fail("Truncated PNG stream")
        }
        result.append(part)
    }
    return result
}
let args = CommandLine.arguments
if args.count == 4 && args[1] == "--extract" {
    let asset = AVURLAsset(url: URL(fileURLWithPath: args[2]))
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    try FileManager.default.createDirectory(atPath: args[3], withIntermediateDirectories: true)
    var generatedTimes: [[String: Double]] = []
    for i in 0..<112 {
        try autoreleasepool {
        var actualTime = CMTime.zero
        let image = try generator.copyCGImage(at: CMTime(value: Int64(i), timescale: 2), actualTime: &actualTime)
        generatedTimes.append(["requested": Double(i) / 2, "actual": CMTimeGetSeconds(actualTime)])
        let url = URL(fileURLWithPath: args[3]).appendingPathComponent(String(format: "%03d.png", i))
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("PNG destination failed") }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { fail("PNG write failed") }
        }
    }
    guard let track = asset.tracks(withMediaType: .video).first else { fail("No video track") }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    reader.add(output)
    reader.startReading()
    var samples = 0, visibleSamples = 0
    var firstPTS = Double.infinity, lastPTS = -Double.infinity
    let duration = CMTimeGetSeconds(asset.duration)
    while let sample = output.copyNextSampleBuffer() {
        samples += 1
        let pts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
        firstPTS = min(firstPTS, pts)
        lastPTS = max(lastPTS, pts)
        if pts >= 0 && pts < duration { visibleSamples += 1 }
    }
    guard reader.status == .completed else { fail("Video sample validation failed") }
    let metadata: [String: Any] = ["width": track.naturalSize.width, "height": track.naturalSize.height, "fps": track.nominalFrameRate, "duration": duration, "codedSamples": samples, "visibleSamples": visibleSamples, "encoderPaddingSamples": samples - visibleSamples, "firstSamplePTS": firstPTS, "lastSamplePTS": lastPTS, "decodedFrames": 112, "generatedFrameTimes": generatedTimes]
    let json = try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted, .sortedKeys])
    try json.write(to: URL(fileURLWithPath: args[3]).appendingPathComponent("video-metadata.json"))
    exit(0)
}
guard args.count == 2 else { fail("Usage: lancer-video OUTPUT.mp4 < length-prefixed-PNG-stream; or --extract INPUT.mp4 OUTPUT_DIR") }
let width = 1440, height = 900, fps: Int32 = 60
let writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: args[1]), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000, AVVideoExpectedSourceFrameRateKey: fps, AVVideoAllowFrameReorderingKey: false]
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
])
writer.add(input)
guard writer.startWriting() else { fail("Cannot start encoder: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)
var frame = 0
while let header = readExactly(4) {
    let length = header.reduce(0) { ($0 << 8) | Int($1) }
    guard length > 0, length < 20_000_000, let png = readExactly(length) else { fail("Invalid PNG length") }
    autoreleasepool {
        guard let source = CGImageSourceCreateWithData(png as CFData, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil), image.width == width, image.height == height else { fail("Invalid Electron frame size") }
        while !input.isReadyForMoreMediaData {
            if writer.status == .failed { fail("Encoder failed: \(String(describing: writer.error))") }
            Thread.sleep(forTimeInterval: 0.001)
        }
        var buffer: CVPixelBuffer?
        guard let pool = adaptor.pixelBufferPool, CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess, let buffer else { fail("Pixel buffer allocation failed") }
        CVPixelBufferLockBaseAddress(buffer, [])
        guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { fail("Pixel conversion failed") }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        CVPixelBufferUnlockBaseAddress(buffer, [])
        guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: fps)) else { fail("Frame append failed") }
    }
    frame += 1
}
input.markAsFinished()
writer.endSession(atSourceTime: CMTime(value: Int64(frame), timescale: fps))
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()
guard writer.status == .completed else { fail("Finalization failed: \(String(describing: writer.error))") }
print("Encoded \(frame) actual Electron frames at 60 fps")
