import AVFoundation
import Combine

/// AVPlayer wrapper that plays streams through the Rust localhost proxy.
class StreamPlayer: ObservableObject {
    let player = AVPlayer()
    @Published var isPlaying = false
    @Published var error: String?

    private let proxyPort: UInt16
    private var observation: NSKeyValueObservation?

    init(proxyPort: UInt16) {
        self.proxyPort = proxyPort
        observation = player.observe(\.timeControlStatus) { [weak self] player, _ in
            DispatchQueue.main.async {
                self?.isPlaying = player.timeControlStatus == .playing
            }
        }
    }

    func play(streamUrl: String) {
        let encoded = streamUrl.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? streamUrl
        let proxied = "http://127.0.0.1:\(proxyPort)/stream?url=\(encoded)"
        guard let url = URL(string: proxied) else {
            error = "Invalid stream URL"
            return
        }
        error = nil
        let item = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: item)
        player.play()
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        isPlaying = false
    }

    deinit {
        observation?.invalidate()
    }
}
