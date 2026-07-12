import Foundation
import Photos
import UIKit
import CoreLocation

/// Lightweight, LLM-friendly description of a single photo or video.
struct PhotoSignal: Identifiable, Hashable {
    /// `PHAsset.localIdentifier` — stable handle used to re-fetch pixels later.
    let id: String
    let creationDate: Date?
    let latitude: Double?
    let longitude: Double?
    let isVideo: Bool
    let durationSeconds: Double

    var coordinate: CLLocationCoordinate2D? {
        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var timeLabel: String {
        guard let creationDate else { return "unknown time" }
        return creationDate.formatted(date: .omitted, time: .shortened)
    }
}

/// Reads the camera roll via PhotoKit. All heavy work happens off the main actor.
final class PhotoService {

    enum PhotoError: LocalizedError {
        case accessDenied
        var errorDescription: String? {
            "Photo library access was denied. Enable it in Settings › Auto Journal › Photos."
        }
    }

    /// Requests read access to the photo library. Returns true if we can read.
    func requestAccess() async -> Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch status {
        case .authorized, .limited:
            return true
        case .notDetermined:
            let granted = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            return granted == .authorized || granted == .limited
        default:
            return false
        }
    }

    /// Returns time-ordered metadata for every asset created on `date`.
    func photoSignals(for date: Date, calendar: Calendar = .current) async throws -> [PhotoSignal] {
        guard await requestAccess() else { throw PhotoError.accessDenied }

        let dayStart = calendar.startOfDay(for: date)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return [] }

        let options = PHFetchOptions()
        options.predicate = NSPredicate(
            format: "creationDate >= %@ AND creationDate < %@",
            dayStart as NSDate, dayEnd as NSDate
        )
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]

        let result = PHAsset.fetchAssets(with: options)
        var signals: [PhotoSignal] = []
        result.enumerateObjects { asset, _, _ in
            signals.append(
                PhotoSignal(
                    id: asset.localIdentifier,
                    creationDate: asset.creationDate,
                    latitude: asset.location?.coordinate.latitude,
                    longitude: asset.location?.coordinate.longitude,
                    isVideo: asset.mediaType == .video,
                    durationSeconds: asset.duration
                )
            )
        }
        return signals
    }

    /// Loads downsized JPEG bytes as base64 data URIs for the given asset ids.
    /// Videos contribute a representative frame (their poster thumbnail).
    /// - Returns: dictionary keyed by asset local identifier.
    func base64JPEGs(
        for identifiers: [String],
        maxDimension: CGFloat = 768,
        compression: CGFloat = 0.6
    ) async -> [String: String] {
        guard !identifiers.isEmpty else { return [:] }
        let fetch = PHAsset.fetchAssets(withLocalIdentifiers: identifiers, options: nil)
        var assets: [PHAsset] = []
        fetch.enumerateObjects { asset, _, _ in assets.append(asset) }

        var out: [String: String] = [:]
        for asset in assets {
            if let dataURI = await Self.dataURI(
                for: asset, maxDimension: maxDimension, compression: compression
            ) {
                out[asset.localIdentifier] = dataURI
            }
        }
        return out
    }

    private static func dataURI(
        for asset: PHAsset,
        maxDimension: CGFloat,
        compression: CGFloat
    ) async -> String? {
        let target = CGSize(width: maxDimension, height: maxDimension)
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false

        let image: UIImage? = await withCheckedContinuation { continuation in
            var resumed = false
            PHImageManager.default().requestImage(
                for: asset,
                targetSize: target,
                contentMode: .aspectFit,
                options: options
            ) { image, info in
                // requestImage may call back multiple times (degraded then full).
                let isDegraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
                if isDegraded { return }
                guard !resumed else { return }
                resumed = true
                continuation.resume(returning: image)
            }
        }

        guard let image, let jpeg = image.jpegData(compressionQuality: compression) else {
            return nil
        }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }
}
