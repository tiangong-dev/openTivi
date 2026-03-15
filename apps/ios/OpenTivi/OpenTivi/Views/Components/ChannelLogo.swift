import SwiftUI

struct ChannelLogo: View {
    let url: String?
    var size: CGFloat = 40

    var body: some View {
        if let urlStr = url, let imageUrl = URL(string: urlStr) {
            AsyncImage(url: imageUrl) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                case .failure:
                    placeholder
                default:
                    placeholder.overlay { ProgressView().scaleEffect(0.5) }
                }
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Color(.systemGray5))
            .frame(width: size, height: size)
            .overlay {
                Image(systemName: "tv")
                    .font(.system(size: size * 0.35))
                    .foregroundColor(.secondary)
            }
    }
}
