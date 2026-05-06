import Foundation
#if canImport(FirebaseDatabase)
import FirebaseDatabase
#endif

protocol UserProfileRepositoring: Sendable {
    func writeUserProfile(_ profile: UserProfile, uid: String) async throws
    func readUserProfile(uid: String) async throws -> UserProfile?
}

protocol UserProfileCaching: Sendable {
    func readCachedProfile(uid: String) -> UserProfile?
    func cacheProfile(_ profile: UserProfile, uid: String)
    func clearCachedProfile(uid: String)
}

final class UserDefaultsProfileCache: UserProfileCaching, @unchecked Sendable {
    private let userDefaults: UserDefaults

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func readCachedProfile(uid: String) -> UserProfile? {
        guard let data = userDefaults.data(forKey: cacheKey(uid: uid)) else {
            return nil
        }

        return try? JSONDecoder.clubRunFirebase.decode(UserProfile.self, from: data)
    }

    func cacheProfile(_ profile: UserProfile, uid: String) {
        guard let data = try? JSONEncoder.clubRunFirebase.encode(profile) else {
            return
        }

        userDefaults.set(data, forKey: cacheKey(uid: uid))
    }

    func clearCachedProfile(uid: String) {
        userDefaults.removeObject(forKey: cacheKey(uid: uid))
    }

    private func cacheKey(uid: String) -> String {
        "clubrun.userProfile.\(uid)"
    }
}

struct UserProfileService: Sendable {
    let repository: UserProfileRepositoring
    let cache: UserProfileCaching

    func saveProfile(_ profile: UserProfile, uid: String) async throws {
        try await repository.writeUserProfile(profile, uid: uid)
        cache.cacheProfile(profile, uid: uid)
    }

    func profile(uid: String) async throws -> UserProfile? {
        if let cached = cache.readCachedProfile(uid: uid) {
            return cached
        }

        let profile = try await repository.readUserProfile(uid: uid)
        if let profile {
            cache.cacheProfile(profile, uid: uid)
        }
        return profile
    }

    func clearCachedProfile(uid: String) {
        cache.clearCachedProfile(uid: uid)
    }
}

#if canImport(FirebaseDatabase)
final class FirebaseUserProfileRepository: UserProfileRepositoring, @unchecked Sendable {
    private let database: DatabaseReference

    init(database: DatabaseReference = Database.database().reference()) {
        self.database = database
    }

    func writeUserProfile(_ profile: UserProfile, uid: String) async throws {
        let data = try JSONEncoder.clubRunFirebase.encode(profile)
        let object = try JSONSerialization.jsonObject(with: data)
        try await database.child(BackendPaths.user(uid)).setValue(object)
    }

    func readUserProfile(uid: String) async throws -> UserProfile? {
        try await withCheckedThrowingContinuation { continuation in
            database.child(BackendPaths.user(uid)).observeSingleEvent(of: .value) { snapshot in
                guard snapshot.exists(), let value = snapshot.value else {
                    continuation.resume(returning: nil)
                    return
                }

                do {
                    let data = try JSONSerialization.data(withJSONObject: value)
                    let profile = try JSONDecoder.clubRunFirebase.decode(UserProfile.self, from: data)
                    continuation.resume(returning: profile)
                } catch {
                    continuation.resume(throwing: error)
                }
            } withCancel: { error in
                continuation.resume(throwing: error)
            }
        }
    }
}
#endif
