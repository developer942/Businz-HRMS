# BUSINZ HRMS Mobile

Flutter application for Android and iOS connected to the existing BUSINZ HRMS API.

## Local setup

```powershell
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1
```

Use `10.0.2.2` for an Android emulator. For a physical device, use an HTTPS staging API or a reachable development-machine address permitted by the native network configuration.

## Android release

Production endpoint:

```powershell
flutter build apk --release --dart-define=API_BASE_URL=https://hrms.businz.com/api/v1
flutter build appbundle --release --dart-define=API_BASE_URL=https://hrms.businz.com/api/v1
```

For store signing, create `android/key.properties` locally (never commit it):

```properties
storePassword=...
keyPassword=...
keyAlias=...
storeFile=C:\\secure\\path\\businz-upload.jks
```

Without that file, Gradle intentionally falls back to the debug key so local release-mode installation works. Such an artifact is not suitable for Play Store distribution.

## iOS release

The iOS project must be opened on macOS with Xcode:

```bash
flutter pub get
cd ios && pod install && cd ..
flutter analyze
flutter test
flutter build ipa --release --dart-define=API_BASE_URL=https://hrms.businz.com/api/v1
```

Select the correct Apple Developer team, App ID `com.businz.hrms`, provisioning profile, push-notification entitlement (after APNs/Firebase configuration), and background-location capability. Validate on physical iPhone/iPad devices before TestFlight submission.

See `../docs/BUSINZ_MOBILE_AUDIT.md` for the audited module/API matrix, verified functionality and exact outstanding parity work.
