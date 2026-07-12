import Foundation
import CoreLocation

/// A distinct place the user was, derived from clustered photo GPS points.
struct PlaceVisit: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let firstSeen: Date?
    let latitude: Double
    let longitude: Double

    var timeLabel: String {
        guard let firstSeen else { return name }
        return "\(name) (\(firstSeen.formatted(date: .omitted, time: .shortened)))"
    }
}

/// Turns raw photo coordinates into a readable, de-duplicated place trail.
///
/// Coordinates are first clustered so nearby photos collapse into one visit,
/// then each cluster centroid is reverse-geocoded. `CLGeocoder` throttles
/// aggressively, so we geocode sequentially with a small gap between calls.
final class LocationService {
    private let geocoder = CLGeocoder()

    /// Distance (metres) beyond which a photo starts a new place cluster.
    private let clusterRadius: CLLocationDistance = 500

    func placeTrail(from photos: [PhotoSignal]) async -> [PlaceVisit] {
        let located = photos
            .compactMap { photo -> (CLLocation, Date?)? in
                guard let coord = photo.coordinate else { return nil }
                return (CLLocation(latitude: coord.latitude, longitude: coord.longitude), photo.creationDate)
            }
            .sorted { ($0.1 ?? .distantPast) < ($1.1 ?? .distantPast) }

        guard !located.isEmpty else { return [] }

        // Sequential clustering over time-ordered points.
        var clusters: [[(CLLocation, Date?)]] = []
        for point in located {
            if let last = clusters.last?.last,
               point.0.distance(from: last.0) <= clusterRadius {
                clusters[clusters.count - 1].append(point)
            } else {
                clusters.append([point])
            }
        }

        var visits: [PlaceVisit] = []
        for cluster in clusters {
            let centroid = Self.centroid(of: cluster.map { $0.0 })
            let firstSeen = cluster.compactMap { $0.1 }.min()
            let name = await placeName(for: centroid)
            // Collapse consecutive duplicate names into one visit.
            if let name, visits.last?.name != name {
                visits.append(
                    PlaceVisit(
                        name: name,
                        firstSeen: firstSeen,
                        latitude: centroid.coordinate.latitude,
                        longitude: centroid.coordinate.longitude
                    )
                )
            }
            try? await Task.sleep(nanoseconds: 400_000_000) // be gentle with the geocoder
        }
        return visits
    }

    private func placeName(for location: CLLocation) async -> String? {
        let placemarks = try? await geocoder.reverseGeocodeLocation(location)
        guard let placemark = placemarks?.first else { return nil }

        // Prefer a specific POI/neighbourhood, then locality/city.
        let specific = placemark.name ?? placemark.subLocality ?? placemark.thoroughfare
        let city = placemark.locality ?? placemark.administrativeArea

        switch (specific, city) {
        case let (specific?, city?) where specific != city:
            return "\(specific), \(city)"
        case let (specific?, _):
            return specific
        case let (_, city?):
            return city
        default:
            return placemark.country
        }
    }

    private static func centroid(of locations: [CLLocation]) -> CLLocation {
        guard !locations.isEmpty else { return CLLocation(latitude: 0, longitude: 0) }
        let lat = locations.map(\.coordinate.latitude).reduce(0, +) / Double(locations.count)
        let lon = locations.map(\.coordinate.longitude).reduce(0, +) / Double(locations.count)
        return CLLocation(latitude: lat, longitude: lon)
    }
}
