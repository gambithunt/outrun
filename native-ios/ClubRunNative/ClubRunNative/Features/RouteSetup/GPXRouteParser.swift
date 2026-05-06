import Foundation

enum GPXImportError: Error, Equatable {
    case fileTooLarge
    case invalidXML
    case missingTrackPoints

    var userMessage: String {
        switch self {
        case .fileTooLarge:
            "Choose a GPX file smaller than 2 MB."
        case .invalidXML:
            "That GPX file could not be read."
        case .missingTrackPoints:
            "That GPX file does not include track points."
        }
    }
}

struct GPXRouteParser: Sendable {
    static let maxFileBytes = 2 * 1024 * 1024

    func parseRouteData(from data: Data) throws -> RouteData {
        guard data.count <= Self.maxFileBytes else {
            throw GPXImportError.fileTooLarge
        }

        let delegate = GPXTrackPointParserDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate

        guard parser.parse() else {
            throw GPXImportError.invalidXML
        }

        guard delegate.points.count >= 2 else {
            throw GPXImportError.missingTrackPoints
        }

        return RouteData(
            points: delegate.points.map { [$0.lat, $0.lng] },
            distanceMetres: GPXDistanceCalculator.distanceMetres(for: delegate.points),
            durationSeconds: nil,
            source: .gpx,
            stops: stops(for: delegate.points)
        )
    }

    private func stops(for points: [RouteCoordinate]) -> [RouteStopDraft] {
        guard let start = points.first, let finish = points.last else {
            return []
        }

        return [
            RouteStopDraft(
                id: "gpx-start",
                kind: .start,
                order: 0,
                label: "GPX Start",
                lat: start.lat,
                lng: start.lng,
                source: .coordinates
            ),
            RouteStopDraft(
                id: "gpx-finish",
                kind: .destination,
                order: 1,
                label: "GPX Finish",
                lat: finish.lat,
                lng: finish.lng,
                source: .coordinates
            )
        ]
    }
}

enum GPXDistanceCalculator {
    static func distanceMetres(for points: [RouteCoordinate]) -> Double {
        zip(points.dropLast(), points.dropFirst()).reduce(0) { total, pair in
            total + distanceMetres(from: pair.0, to: pair.1)
        }
    }

    private static func distanceMetres(from source: RouteCoordinate, to destination: RouteCoordinate) -> Double {
        let earthRadius = 6_371_000.0
        let sourceLat = source.lat * .pi / 180
        let destinationLat = destination.lat * .pi / 180
        let deltaLat = (destination.lat - source.lat) * .pi / 180
        let deltaLng = (destination.lng - source.lng) * .pi / 180
        let a = sin(deltaLat / 2) * sin(deltaLat / 2)
            + cos(sourceLat) * cos(destinationLat)
            * sin(deltaLng / 2) * sin(deltaLng / 2)
        let c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return earthRadius * c
    }
}

private final class GPXTrackPointParserDelegate: NSObject, XMLParserDelegate {
    private(set) var points: [RouteCoordinate] = []

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes attributeDict: [String: String] = [:]
    ) {
        guard elementName == "trkpt" else {
            return
        }

        guard let latText = attributeDict["lat"],
              let lngText = attributeDict["lon"],
              let lat = Double(latText),
              let lng = Double(lngText) else {
            return
        }

        points.append(RouteCoordinate(lat: lat, lng: lng))
    }

    func parser(_ parser: XMLParser, parseErrorOccurred parseError: Error) {
        points.removeAll()
    }
}
