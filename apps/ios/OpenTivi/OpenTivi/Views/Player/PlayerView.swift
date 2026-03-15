import SwiftUI
import AVKit

struct PlayerView: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @State private var showOverlay = true
    @State private var overlayTimer: Timer?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VideoPlayer(player: playerVM.streamPlayer.player)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation { showOverlay.toggle() }
                    scheduleHideOverlay()
                }
                .gesture(
                    DragGesture(minimumDistance: 50)
                        .onEnded { value in
                            if value.translation.height > 100 {
                                playerVM.isFullScreen = false
                            } else if value.translation.height < -50 {
                                playerVM.nextChannel()
                            } else if value.translation.height > 50 {
                                playerVM.previousChannel()
                            }
                        }
                )

            if showOverlay {
                PlayerOverlay()
                    .environmentObject(playerVM)
                    .transition(.opacity)
            }
        }
        .onAppear { scheduleHideOverlay() }
        .onDisappear { overlayTimer?.invalidate() }
        .statusBarHidden(true)
    }

    private func scheduleHideOverlay() {
        overlayTimer?.invalidate()
        overlayTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { _ in
            withAnimation { showOverlay = false }
        }
    }
}
