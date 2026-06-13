# Release Checklist

This project is much closer to release-ready, but these are the remaining manual steps before shipping to the App Store or Google Play.

## Before building

1. Install the matching iOS device support in Xcode.
   - If Xcode says a device destination is ineligible because a platform such as `iOS 26.4` is not installed, open `Xcode > Settings > Components` and install that iOS platform first.
2. Confirm the production backend values.
   - The app now supports `--dart-define` overrides for backend settings, so release builds do not require source edits.
3. Decide whether you want background location as an optional power-user feature or a default workflow.
   - The app now works with standard foreground location permission.
   - If you plan to market background exploration heavily, make sure your App Store review notes explain why background location is user-visible and core to the product.

## iOS release build

Example:

```bash
flutter build ipa --release \
  --dart-define=AWS_REGION=eu-west-2 \
  --dart-define=COGNITO_USER_POOL_ID=eu-west-2_ORdu8sqG1 \
  --dart-define=COGNITO_USER_POOL_CLIENT_ID=579drfqkb4uueotbod29qq7cs7 \
  --dart-define=APPSYNC_API_ID=xuhhcjmpkremxcv2vrzpgxfrlm \
  --dart-define=APPSYNC_GRAPHQL_URL=https://3focrrhosbd7dkxtkthji467tu.appsync-api.eu-west-2.amazonaws.com/graphql \
  --dart-define=CLOUDFRONT_APPROVED_DOMAIN=d2op1xtsiy6g50.cloudfront.net \
  --dart-define=CLOUDFRONT_SHARED_TILES_DOMAIN=d2jmlw6i9yl338.cloudfront.net
```

Checklist:

- Use a real App Store signing identity and provisioning profile in Xcode.
- Verify location permission copy in the app matches your App Store privacy answers.
- Verify landmark capture, shared mode, and sign-in on a physical device.
- Archive once from Xcode before the final upload if you want to inspect the signing and entitlements visually.

## Android release build

The Android app now supports a standard `key.properties` release-signing flow.

Create `android/key.properties` with:

```properties
storeFile=/absolute/path/to/your-upload-keystore.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Then build with:

```bash
flutter build appbundle --release
```

If `key.properties` is missing, the Gradle config falls back to debug signing so local `--release` runs still work.

## App Store Connect / Play Console

- Upload updated screenshots and the current privacy answers.
- Add review notes that explain:
  - location is used to reveal the map as the user explores
  - background location is optional and improves continuous exploration when enabled
  - landmark photos are user-submitted and moderated before public display
- Test sign-in, sign-out, password challenge, landmark upload, and shared-mode visibility one more time against production.

## Recommended operational checks

- Set an AWS Budget alarm for AppSync, DynamoDB, S3, and CloudFront.
- Add CloudWatch dashboards or alarms for:
  - AppSync request count by operation
  - Lambda error count
  - SQS shared-tile rebuild queue depth
  - DynamoDB throttles and consumed capacity spikes
