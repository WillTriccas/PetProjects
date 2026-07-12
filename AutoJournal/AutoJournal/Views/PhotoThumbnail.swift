import SwiftUI
import Photos

/// Loads a `PHAsset`'s image by local identifier for display in SwiftUI.
struct PhotoThumbnail: View {
    let identifier: String
    var contentMode: ContentMode = .fill
    var targetDimension: CGFloat = 300

    @State private var image: UIImage?

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                } else {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.12))
                        .overlay(ProgressView())
                }
            }
        }
        .task(id: identifier) {
            let scale = UIScreen.main.scale
            image = await PhotoImageLoader.load(
                identifier: identifier,
                targetSize: CGSize(width: targetDimension * scale, height: targetDimension * scale)
            )
        }
    }
}

/// Small helper around `PHImageManager` for on-demand image loads.
enum PhotoImageLoader {
    static func load(identifier: String, targetSize: CGSize) async -> UIImage? {
        let fetch = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil)
        guard let asset = fetch.firstObject else { return nil }

        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true

        return await withCheckedContinuation { continuation in
            var resumed = false
            PHImageManager.default().requestImage(
                for: asset,
                targetSize: targetSize,
                contentMode: .aspectFill,
                options: options
            ) { image, info in
                let isDegraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
                if isDegraded { return }
                guard !resumed else { return }
                resumed = true
                continuation.resume(returning: image)
            }
        }
    }
}
