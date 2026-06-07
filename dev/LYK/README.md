# LYK

LYK is a Flutter starter app for parent-managed screen-time limits.

The first version includes:

- A parent dashboard for choosing a daily limit.
- A guided access setup flow.
- Android native hooks for Usage Access, Device Admin lock permission, app usage reports, and lock-now testing.
- A clear iOS roadmap for Apple's Screen Time APIs.

## Run

```sh
flutter run
```

## Verify

```sh
flutter analyze
flutter test
flutter build apk --debug
flutter build ios --simulator --no-codesign
```

## Platform Notes

Android can grant app usage reporting through Usage Access and device locking through Device Admin. iOS does not allow an ordinary third-party app to lock the whole phone; the production iOS route is Family Controls, Device Activity, and Managed Settings.

See `docs/platform-roadmap.md` for the native milestones and official API links.

## Android Signing

Release builds are signed from the local ignored files `android/key.properties` and `android/app/keystores/lyk-upload-keystore.p12`.

Keep those files private. The upload key is needed for future Android releases unless Google Play support rotates it.
