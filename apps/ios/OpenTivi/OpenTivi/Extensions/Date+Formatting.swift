import Foundation

extension Date {
    func relativeDescription() -> String {
        let now = Date()
        let interval = now.timeIntervalSince(self)

        if interval < 60 { return "just now" }
        if interval < 3600 { return "\(Int(interval / 60)) min ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        if interval < 172800 { return "yesterday" }
        return "\(Int(interval / 86400))d ago"
    }
}

extension String {
    func toDate() -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: self) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: self)
    }
}
