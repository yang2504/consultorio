import AppKit

let destination = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let transform = NSAffineTransform()
        transform.translateX(by: 0, yBy: CGFloat(pixels))
        transform.scaleX(by: CGFloat(pixels) / 112, yBy: -CGFloat(pixels) / 112)
        transform.concat()
        NSColor(calibratedRed: 0.97, green: 0.96, blue: 0.94, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 4, y: 4, width: 104, height: 104), xRadius: 23, yRadius: 23).fill()
        let inset = NSAffineTransform()
        inset.translateX(by: 8, yBy: 8)
        inset.concat()
        NSColor(calibratedRed: 40/255, green: 61/255, blue: 114/255, alpha: 1).set()
        for mirrored in [false, true] {
            NSGraphicsContext.saveGraphicsState()
            if mirrored {
                let mirror = NSAffineTransform()
                mirror.translateX(by: 96, yBy: 0)
                mirror.scaleX(by: -1, yBy: 1)
                mirror.concat()
            }
            let wing = NSBezierPath()
            wing.move(to: NSPoint(x: 43, y: 25))
            wing.curve(to: NSPoint(x: 5, y: 24), controlPoint1: NSPoint(x: 34, y: 10), controlPoint2: NSPoint(x: 25, y: 21))
            wing.curve(to: NSPoint(x: 34, y: 29), controlPoint1: NSPoint(x: 12, y: 30), controlPoint2: NSPoint(x: 23, y: 32))
            wing.curve(to: NSPoint(x: 11, y: 35), controlPoint1: NSPoint(x: 27, y: 34), controlPoint2: NSPoint(x: 18, y: 35))
            wing.curve(to: NSPoint(x: 40, y: 33), controlPoint1: NSPoint(x: 20, y: 40), controlPoint2: NSPoint(x: 32, y: 39))
            wing.line(to: NSPoint(x: 45, y: 29))
            wing.close()
            wing.fill()
            let snake = NSBezierPath()
            snake.move(to: NSPoint(x: 39, y: 34))
            snake.curve(to: NSPoint(x: 39, y: 51), controlPoint1: NSPoint(x: 27, y: 34), controlPoint2: NSPoint(x: 27, y: 49))
            snake.line(to: NSPoint(x: 55, y: 54))
            snake.curve(to: NSPoint(x: 54, y: 69), controlPoint1: NSPoint(x: 65, y: 56), controlPoint2: NSPoint(x: 64, y: 66))
            snake.line(to: NSPoint(x: 42, y: 73))
            snake.curve(to: NSPoint(x: 44, y: 83), controlPoint1: NSPoint(x: 36, y: 75), controlPoint2: NSPoint(x: 38, y: 80))
            snake.lineWidth = 3.5
            snake.lineCapStyle = .round
            snake.stroke()
            NSGraphicsContext.restoreGraphicsState()
        }
        NSBezierPath(ovalIn: NSRect(x: 44, y: 11, width: 8, height: 8)).fill()
        let staff = NSBezierPath()
        staff.move(to: NSPoint(x: 48, y: 20))
        staff.line(to: NSPoint(x: 48, y: 87))
        staff.lineWidth = 3.5
        staff.lineCapStyle = .round
        staff.stroke()
        NSGraphicsContext.restoreGraphicsState()
        let suffix = scale == 2 ? "@2x" : ""
        try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
    }
}
