# LYK platform roadmap

LYK is a Flutter app, but screen-time controls need native OS APIs.

## Android

Current starter hooks:

- `UsageStatsManager.queryAndAggregateUsageStats` for app usage totals.
- `PACKAGE_USAGE_STATS` with a user-granted Usage Access setting.
- `DevicePolicyManager.lockNow()` through a `DeviceAdminReceiver` with the `force-lock` policy.
- Managed-device app blocking with `DevicePolicyManager.setPackagesSuspended()` for detected browsers and game-category apps when LYK is device owner or profile owner.

Next Android work:

- Add a foreground service or scheduled worker for reliable countdown enforcement when the Flutter UI is closed.
- Add manual allow/block rules, emergency unlock, stronger parent identity checks, and tamper handling.
- Store usage snapshots locally before building cloud sync.
- For true "the child cannot leave the app" behavior, provision the device as a managed device and allowlist LYK for Android Lock Task mode. Normal Device Admin can send a lock command, but it cannot keep the whole phone locked until a custom parent password is entered.

## iOS

iOS does not allow a normal third-party app to lock the whole device or inspect arbitrary app usage directly.

The parent-control path is Apple's Screen Time API family:

- Family Controls entitlement.
- Device Activity reports and monitor extension.
- Managed Settings shielding for selected apps and categories.
- Shield Action and Shield Configuration extensions for custom blocked screens.

Next iOS work:

- Request the Family Controls entitlement from Apple.
- Add native iOS Screen Time extensions to the Runner Xcode project.
- Bridge selected schedule/report state back to Flutter.
- Use Managed Settings shielding for the selected apps/categories after the time limit. iOS does not allow a third-party app to block closing the app or lock the whole phone.

Official docs:

- Android UsageStatsManager: https://developer.android.com/reference/android/app/usage/UsageStatsManager
- Android DevicePolicyManager: https://developer.android.com/reference/android/app/admin/DevicePolicyManager
- Android dedicated-device Lock Task mode: https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode
- Apple Family Controls setup: https://developer.apple.com/documentation/xcode/configuring-family-controls
- Apple Family Controls entitlement request: https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement
- Apple Managed Settings ShieldSettings: https://developer.apple.com/documentation/managedsettings/shieldsettings
