import Foundation

/// Matches Desktop `playerUtils.parseXmltvDate` and `VideoPlayer` now/next selection.
enum EpgDesktopParity {
    /// Parses XMLTV-style timestamps and falls back like `Date.parse` in JS.
    static func parseXmltvDate(_ raw: String) -> Date? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let pattern = #"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
              match.numberOfRanges >= 7,
              let yR = Range(match.range(at: 1), in: trimmed),
              let moR = Range(match.range(at: 2), in: trimmed),
              let dR = Range(match.range(at: 3), in: trimmed),
              let hR = Range(match.range(at: 4), in: trimmed),
              let miR = Range(match.range(at: 5), in: trimmed),
              let sR = Range(match.range(at: 6), in: trimmed),
              let y = Int(trimmed[yR]),
              let mo = Int(trimmed[moR]),
              let d = Int(trimmed[dR]),
              let h = Int(trimmed[hR]),
              let mi = Int(trimmed[miR]),
              let s = Int(trimmed[sR])
        else {
            return jsStyleParse(trimmed)
        }

        let offsetRange = match.range(at: 7)
        if offsetRange.location != NSNotFound, let oR = Range(offsetRange, in: trimmed) {
            let offsetStr = String(trimmed[oR])
            guard offsetStr.count >= 5 else { return jsStyleParse(trimmed) }
            let sign: Int = offsetStr.hasPrefix("-") ? -1 : 1
            let digits = offsetStr.dropFirst()
            guard digits.count >= 4,
                  let oh = Int(digits.prefix(2)),
                  let om = Int(digits.suffix(2))
            else { return jsStyleParse(trimmed) }
            let seconds = sign * (oh * 3600 + om * 60)
            var dc = DateComponents()
            dc.calendar = Calendar(identifier: .gregorian)
            dc.timeZone = TimeZone(secondsFromGMT: seconds)
            dc.year = y
            dc.month = mo
            dc.day = d
            dc.hour = h
            dc.minute = mi
            dc.second = s
            return dc.date
        }

        var dc = DateComponents()
        dc.calendar = Calendar.current
        dc.timeZone = TimeZone.current
        dc.year = y
        dc.month = mo
        dc.day = d
        dc.hour = h
        dc.minute = mi
        dc.second = s
        return dc.date
    }

    private static func jsStyleParse(_ trimmed: String) -> Date? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: trimmed) { return d }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: trimmed) { return d }

        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone.current
        df.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return df.date(from: trimmed)
    }

    /// Short local time label for one XMLTV field (Desktop `formatTime`).
    static func formatXmltvTime(_ raw: String) -> String {
        guard let date = parseXmltvDate(raw) else { return raw }
        let df = DateFormatter()
        df.locale = Locale.current
        df.timeZone = TimeZone.current
        df.timeStyle = .short
        df.dateStyle = .none
        return df.string(from: date)
    }

    /// Builds `ChannelEpgSnapshot` the same way as Desktop `VideoPlayer` EPG effect.
    static func channelEpgSnapshot(channelId: Int64, programs: [EpgProgramInfo]) -> ChannelEpgSnapshot {
        let nowMs = Date().timeIntervalSince1970 * 1000

        func startMs(_ p: EpgProgramInfo) -> Double? {
            parseXmltvDate(p.startAt).map { $0.timeIntervalSince1970 * 1000 }
        }

        func endMs(_ p: EpgProgramInfo) -> Double? {
            parseXmltvDate(p.endAt).map { $0.timeIntervalSince1970 * 1000 }
        }

        var currentIndex: Int?
        var currentProgram: EpgProgramInfo?

        for (index, program) in programs.enumerated() {
            guard let start = startMs(program), let end = endMs(program) else { continue }
            if start <= nowMs, nowMs <= end {
                currentIndex = index
                currentProgram = program
                break
            }
        }

        var nowMini: EpgProgramMini?
        var nextMini: EpgProgramMini?

        if let current = currentProgram {
            nowMini = EpgProgramMini(title: current.title, startAt: current.startAt, endAt: current.endAt)
            if let idx = currentIndex, idx + 1 < programs.count {
                let next = programs[idx + 1]
                nextMini = EpgProgramMini(title: next.title, startAt: next.startAt, endAt: next.endAt)
            }
        } else {
            let nextUpcoming = programs.first { program in
                guard let start = startMs(program) else { return false }
                return start > nowMs
            }
            if let next = nextUpcoming {
                nextMini = EpgProgramMini(title: next.title, startAt: next.startAt, endAt: next.endAt)
            }
        }

        // Desktop `getGuidePrograms`: recently ended or future, cap 12.
        let timeline: [EpgProgramMini] = programs
            .filter { program in
                guard let end = endMs(program) else { return false }
                return end >= nowMs - 15 * 60 * 1000
            }
            .prefix(12)
            .map { EpgProgramMini(title: $0.title, startAt: $0.startAt, endAt: $0.endAt) }

        return ChannelEpgSnapshot(
            channelId: channelId,
            now: nowMini,
            next: nextMini,
            timelinePrograms: Array(timeline)
        )
    }
}
