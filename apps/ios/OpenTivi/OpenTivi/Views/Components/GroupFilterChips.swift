import SwiftUI

struct GroupFilterChips: View {
    let groups: [String]
    @Binding var selected: String?
    @ObservedObject private var locale = LocaleManager.shared

    var body: some View {
        HStack(spacing: 8) {
            chipButton(label: locale.t("channels.all"), isSelected: selected == nil) {
                selected = nil
            }

            ForEach(groups, id: \.self) { group in
                chipButton(label: group, isSelected: selected == group) {
                    selected = group
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private func chipButton(label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline)
                .fontWeight(isSelected ? .semibold : .regular)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background {
                    if isSelected {
                        Capsule().strokeBorder(Color.tiviPrimary, lineWidth: 1.5)
                    } else {
                        Capsule().fill(.ultraThinMaterial)
                    }
                }
                .foregroundColor(isSelected ? .tiviPrimary : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
