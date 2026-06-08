import SwiftUI

struct PlayerView: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @State private var showOverlay = true
    @State private var overlayTimer: Timer?
    @State private var dragOffset: CGFloat = 0
    /// When touch-lock is on, tap reveals channel/EPG info (read-only) plus unlock.
    @State private var showLockedOverlay = false
    @State private var lockedOverlayTimer: Timer?
    @State private var isChannelTransitioning = false
    /// Track whether the current gesture has been recognized as a vertical swipe.
    @State private var isDraggingVertically: Bool?
    /// Normalized drag progress for opacity effects (0...1)
    @State private var dragProgress: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            let pageW = geo.size.width
            let pageH = geo.size.height

            Group {
                if playerVM.isVideoLandscape {
                    channelPagingStack(pageWidth: pageW, pageHeight: pageH)
                        .frame(width: pageW, height: pageH)
                        .rotationEffect(.degrees(90))
                        .frame(width: pageH, height: pageW)
                } else {
                    channelPagingStack(pageWidth: pageW, pageHeight: pageH)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .position(x: pageW / 2, y: pageH / 2)
        }
        .background(Color.black)
        .onAppear { scheduleHideOverlay() }
        .onDisappear {
            overlayTimer?.invalidate()
            lockedOverlayTimer?.invalidate()
        }
        .statusBarHidden(true)
        .interactiveDismissDisabled()
    }

    @ViewBuilder
    private func channelPagingStack(pageWidth: CGFloat, pageHeight: CGFloat) -> some View {
        let nextCh = nextChannelForSwipe
        let prevCh = prevChannelForSwipe
        let swipeLength = playerVM.isVideoLandscape ? pageWidth : pageHeight

        ZStack {
            Color.black
                .frame(width: pageWidth, height: pageHeight)

            // Next channel sits below, revealed as current page slides up
            if let nextCh {
                channelPreviewPage(channel: nextCh, pageWidth: pageWidth, pageHeight: pageHeight)
                    .offset(y: swipeLength + dragOffset)
            }

            // Previous channel sits above, revealed as current page slides down
            if let prevCh {
                channelPreviewPage(channel: prevCh, pageWidth: pageWidth, pageHeight: pageHeight)
                    .offset(y: -swipeLength + dragOffset)
            }

            // Current playback page slides with the drag, scales slightly for depth
            currentPlaybackPage(pageWidth: pageWidth, pageHeight: pageHeight)
                .offset(y: dragOffset)
                .scaleEffect(1.0 - dragProgress * 0.04)
                .opacity(1.0 - dragProgress * 0.15)

            // Page position indicator (right edge)
            if let index = playerVM.currentChannelIndex(), playerVM.channelList.count > 1 {
                pageIndicator(currentIndex: index, total: playerVM.channelList.count, pageHeight: pageHeight)
            }
        }
        .frame(width: pageWidth, height: pageHeight)
        .clipped()
        .contentShape(Rectangle())
        .simultaneousGesture(
            channelSwipeGesture(pageHeight: swipeLength, hasPrev: prevCh != nil, hasNext: nextCh != nil)
        )
    }

    @ViewBuilder
    private func pageIndicator(currentIndex: Int, total: Int, pageHeight: CGFloat) -> some View {
        // Show at most 5 dots around the current position
        let maxDots = 5
        let halfRange = maxDots / 2
        let startIdx = max(0, min(currentIndex - halfRange, total - maxDots))
        let endIdx = min(total, startIdx + maxDots)

        VStack(spacing: 4) {
            if startIdx > 0 {
                Image(systemName: "chevron.up")
                    .font(.system(size: 6))
                    .foregroundColor(.white.opacity(0.4))
            }
            ForEach(startIdx..<endIdx, id: \.self) { i in
                Circle()
                    .fill(i == currentIndex ? Color.white : Color.white.opacity(0.3))
                    .frame(width: i == currentIndex ? 6 : 4, height: i == currentIndex ? 6 : 4)
            }
            if endIdx < total {
                Image(systemName: "chevron.down")
                    .font(.system(size: 6))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.trailing, 6)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        .opacity(showOverlay || dragProgress > 0 ? 1 : 0)
        .animation(.easeInOut(duration: 0.2), value: showOverlay)
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private func channelPreviewPage(channel: ChannelInfo, pageWidth: CGFloat, pageHeight: CGFloat) -> some View {
        ZStack {
            Color.black
            VStack(spacing: 16) {
                ChannelLogo(url: channel.logoUrl, size: 88)
                Text(channel.name)
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                if let group = channel.groupName {
                    Text(group)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
        }
        .frame(width: pageWidth, height: pageHeight)
    }

    @ViewBuilder
    private func currentPlaybackPage(pageWidth: CGFloat, pageHeight: CGFloat) -> some View {
        ZStack {
            Color.black

            Group {
                switch playerVM.activeBackendKind {
                case .avplayer:
                    AVPlayerLayerView(player: playerVM.streamPlayer)
                case .vlc:
                    VLCVideoView(player: playerVM.streamPlayer)
                }
            }
            .frame(width: pageWidth, height: pageHeight)
            .allowsHitTesting(false)

            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if playerVM.isLocked {
                        withAnimation { showLockedOverlay.toggle() }
                        scheduleLockedOverlayHide()
                    } else {
                        withAnimation { showOverlay.toggle() }
                        scheduleHideOverlay()
                    }
                }

            if playerVM.isLocked {
                if showLockedOverlay {
                    ZStack {
                        PlayerOverlayBackground()
                        VStack {
                            HStack {
                                Button {
                                    withAnimation {
                                        playerVM.isLocked = false
                                        showLockedOverlay = false
                                        showOverlay = true
                                        scheduleHideOverlay()
                                    }
                                } label: {
                                    Image(systemName: "lock.fill")
                                        .font(.system(size: 28))
                                        .foregroundStyle(.white)
                                        .padding(12)
                                        .background(Color.tiviPopover.opacity(0.85))
                                        .clipShape(Circle())
                                        .shadow(radius: 4)
                                }
                                .padding(.leading, 20)
                                .padding(.top, 12)
                                Spacer()
                            }
                            Spacer()
                            PlayerInfoPanel(showSwipeHint: false)
                        }
                    }
                    .transition(.opacity)
                }
            } else if showOverlay {
                PlayerOverlay()
                    .environmentObject(playerVM)
                    .transition(.opacity)
            }
        }
        .frame(width: pageWidth, height: pageHeight)
    }

    private var nextChannelForSwipe: ChannelInfo? {
        guard let i = playerVM.currentChannelIndex(),
              i + 1 < playerVM.channelList.count else { return nil }
        return playerVM.channelList[i + 1]
    }

    private var prevChannelForSwipe: ChannelInfo? {
        guard let i = playerVM.currentChannelIndex(), i > 0 else { return nil }
        return playerVM.channelList[i - 1]
    }

    private func swipeTranslation(from value: DragGesture.Value) -> (primary: CGFloat, cross: CGFloat) {
        if playerVM.isVideoLandscape {
            return (primary: -value.translation.width, cross: value.translation.height)
        }
        return (primary: value.translation.height, cross: value.translation.width)
    }

    private func swipePredicted(from value: DragGesture.Value) -> CGFloat {
        if playerVM.isVideoLandscape {
            return -value.predictedEndTranslation.width
        }
        return value.predictedEndTranslation.height
    }

    private func channelSwipeGesture(pageHeight: CGFloat, hasPrev: Bool, hasNext: Bool) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                guard !playerVM.isLocked, !isChannelTransitioning else { return }
                let (primary, cross) = swipeTranslation(from: value)

                // Lock direction on first meaningful movement
                if isDraggingVertically == nil {
                    if abs(primary) > 10 || abs(cross) > 10 {
                        isDraggingVertically = abs(primary) >= abs(cross)
                    }
                    if isDraggingVertically != true { return }
                }
                guard isDraggingVertically == true else { return }

                let offset = rubberBandVertical(primary, hasPrev: hasPrev, hasNext: hasNext)
                dragOffset = offset
                dragProgress = min(abs(offset) / pageHeight, 1.0)
            }
            .onEnded { value in
                defer {
                    isDraggingVertically = nil
                    dragProgress = 0
                }
                guard !playerVM.isLocked, !isChannelTransitioning else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        dragOffset = 0
                        dragProgress = 0
                    }
                    return
                }
                guard isDraggingVertically == true else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        dragOffset = 0
                        dragProgress = 0
                    }
                    return
                }
                let (primary, cross) = swipeTranslation(from: value)
                let predicted = swipePredicted(from: value)
                handleChannelSwipeEnd(primary: primary, cross: abs(cross), predicted: predicted, pageHeight: pageHeight, hasPrev: hasPrev, hasNext: hasNext)
            }
    }

    private func rubberBandVertical(_ raw: CGFloat, hasPrev: Bool, hasNext: Bool) -> CGFloat {
        if raw < 0, !hasNext { return raw * 0.28 }
        if raw > 0, !hasPrev { return raw * 0.28 }
        return raw
    }

    private func handleChannelSwipeEnd(primary: CGFloat, cross: CGFloat, predicted: CGFloat, pageHeight: CGFloat, hasPrev: Bool, hasNext: Bool) {
        let velocity = predicted - primary
        // Lower threshold for TikTok-like sensitivity
        let threshold = max(56, pageHeight * 0.12)
        let velThreshold: CGFloat = 250

        if (primary < -threshold || velocity < -velThreshold), hasNext, playerVM.canGoToNextChannel() {
            commitChannelSwipe(targetOffset: -pageHeight) { playerVM.nextChannel() }
        } else if (primary > threshold || velocity > velThreshold), hasPrev, playerVM.canGoToPreviousChannel() {
            commitChannelSwipe(targetOffset: pageHeight) { playerVM.previousChannel() }
        } else {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                dragOffset = 0
                dragProgress = 0
            }
        }
    }

    private func commitChannelSwipe(targetOffset: CGFloat, updateChannel: @escaping () -> Void) {
        isChannelTransitioning = true
        // Spring-driven slide-out for a snappy TikTok feel
        withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
            dragOffset = targetOffset
            dragProgress = 1.0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.30) {
            updateChannel()
            var t = Transaction()
            t.disablesAnimations = true
            withTransaction(t) {
                dragOffset = 0
                dragProgress = 0
            }
            DispatchQueue.main.async {
                isChannelTransitioning = false
            }
        }
    }

    private func scheduleHideOverlay() {
        overlayTimer?.invalidate()
        overlayTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { _ in
            withAnimation { showOverlay = false }
        }
    }

    private func scheduleLockedOverlayHide() {
        lockedOverlayTimer?.invalidate()
        lockedOverlayTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { _ in
            withAnimation { showLockedOverlay = false }
        }
    }
}
