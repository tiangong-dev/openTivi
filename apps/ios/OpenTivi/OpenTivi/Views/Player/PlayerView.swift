import SwiftUI

struct PlayerView: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @State private var showOverlay = true
    @State private var overlayTimer: Timer?
    @State private var dragOffset: CGFloat = 0
    @State private var showLockButton = false
    @State private var lockButtonTimer: Timer?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Pure video surface — no built-in controls
            VLCVideoView(player: playerVM.streamPlayer)
                .ignoresSafeArea()

            // Transparent gesture layer (above video, below overlay)
            Color.clear
                .contentShape(Rectangle())
                .ignoresSafeArea()
                .onTapGesture {
                    if playerVM.isLocked {
                        withAnimation { showLockButton.toggle() }
                        scheduleLockButtonHide()
                    } else {
                        withAnimation { showOverlay.toggle() }
                        scheduleHideOverlay()
                    }
                }
                .gesture(
                    playerVM.isLocked ? nil :
                    DragGesture(minimumDistance: 50)
                        .onChanged { value in
                            dragOffset = value.translation.height
                        }
                        .onEnded { value in
                            let vertical = value.translation.height
                            let horizontal = abs(value.translation.width)
                            dragOffset = 0
                            guard abs(vertical) > horizontal else { return }
                            if vertical < -80 {
                                playerVM.nextChannel()
                            } else if vertical > 80 {
                                playerVM.previousChannel()
                            }
                        }
                )

            if playerVM.isLocked {
                // Show only the unlock button on the left center
                if showLockButton {
                    HStack {
                        Button {
                            withAnimation {
                                playerVM.isLocked = false
                                showLockButton = false
                                showOverlay = true
                                scheduleHideOverlay()
                            }
                        } label: {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 28))
                                .foregroundStyle(.white)
                                .padding(12)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                                .shadow(radius: 4)
                        }
                        .padding(.leading, 20)
                        Spacer()
                    }
                    .transition(.opacity)
                }
            } else if showOverlay {
                PlayerOverlay()
                    .environmentObject(playerVM)
                    .transition(.opacity)
            }
        }
        .onAppear { scheduleHideOverlay() }
        .onDisappear {
            overlayTimer?.invalidate()
            lockButtonTimer?.invalidate()
        }
        .statusBarHidden(true)
        .interactiveDismissDisabled()
    }

    private func scheduleHideOverlay() {
        overlayTimer?.invalidate()
        overlayTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { _ in
            withAnimation { showOverlay = false }
        }
    }

    private func scheduleLockButtonHide() {
        lockButtonTimer?.invalidate()
        lockButtonTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { _ in
            withAnimation { showLockButton = false }
        }
    }
}
