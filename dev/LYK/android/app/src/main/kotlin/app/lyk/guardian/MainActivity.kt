package app.lyk.guardian

import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "lyk/device_guardian"
    private val preferencesName = "lyk_guardian"
    private val sessionGuardActiveKey = "session_guard_active"
    private val suspendedPackagesKey = "suspended_packages"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "hasUsageAccess" -> result.success(hasUsageAccess())
                    "openUsageAccessSettings" -> {
                        startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                        result.success(null)
                    }
                    "isDeviceAdminActive" -> result.success(isDeviceAdminActive())
                    "openDeviceAdminSetup" -> {
                        openDeviceAdminSetup()
                        result.success(null)
                    }
                    "lockNow" -> result.success(lockNow())
                    "setSessionGuardActive" -> {
                        val active = call.argument<Boolean>("active") ?: false
                        setSessionGuardActive(active)
                        result.success(null)
                    }
                    "isManagedAppBlockingAvailable" -> {
                        result.success(isManagedAppBlockingAvailable())
                    }
                    "browsersAndGamesPreview" -> {
                        result.success(discoverBrowsersAndGames().map { it.toMap() })
                    }
                    "blockBrowsersAndGames" -> {
                        result.success(blockBrowsersAndGames())
                    }
                    "unblockBlockedApps" -> {
                        result.success(unblockBlockedApps())
                    }
                    "usageReport" -> {
                        val minutes = call.argument<Int>("minutes") ?: 1440
                        result.success(loadUsageReport(minutes))
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        lockIfSessionGuardActive()
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) {
            lockIfSessionGuardActive()
        }
    }

    private fun hasUsageAccess(): Boolean {
        val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                applicationInfo.uid,
                packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                applicationInfo.uid,
                packageName,
            )
        }

        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun isDeviceAdminActive(): Boolean {
        val manager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return manager.isAdminActive(adminComponent())
    }

    private fun openDeviceAdminSetup() {
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent())
            putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "LYK needs lock access so a parent-approved timer can lock this device.",
            )
        }
        startActivity(intent)
    }

    private fun lockNow(): Boolean {
        val manager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (!manager.isAdminActive(adminComponent())) {
            return false
        }

        manager.lockNow()
        return true
    }

    private fun setSessionGuardActive(active: Boolean) {
        getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(sessionGuardActiveKey, active)
            .apply()
    }

    private fun lockIfSessionGuardActive() {
        val active = getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
            .getBoolean(sessionGuardActiveKey, false)
        if (active) {
            lockNow()
        }
    }

    private fun isManagedAppBlockingAvailable(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return false
        }

        val manager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return manager.isAdminActive(adminComponent()) &&
            (manager.isDeviceOwnerApp(packageName) || manager.isProfileOwnerApp(packageName))
    }

    private fun blockBrowsersAndGames(): Map<String, Any> {
        val targets = discoverBrowsersAndGames()
        if (!isManagedAppBlockingAvailable()) {
            return blockResult(false, targets.size, 0, targets.size, emptyList())
        }

        if (targets.isEmpty()) {
            return blockResult(true, 0, 0, 0, emptyList())
        }

        return suspendTargets(targets, true)
    }

    private fun unblockBlockedApps(): Map<String, Any> {
        val packageNames = getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
            .getStringSet(suspendedPackagesKey, emptySet())
            .orEmpty()
            .toList()

        val targets = packageNames.map {
            AppBlockTarget(
                packageName = it,
                appName = labelForPackage(it),
                reason = "app",
            )
        }

        if (targets.isEmpty()) {
            return blockResult(true, 0, 0, 0, emptyList())
        }

        if (!isManagedAppBlockingAvailable()) {
            return blockResult(false, targets.size, 0, targets.size, emptyList())
        }

        return suspendTargets(targets, false)
    }

    private fun suspendTargets(targets: List<AppBlockTarget>, suspended: Boolean): Map<String, Any> {
        return try {
            val manager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val packages = targets.map { it.packageName }.toTypedArray()
            val failedPackages = manager.setPackagesSuspended(
                adminComponent(),
                packages,
                suspended,
            ).toSet()
            val affectedTargets = targets.filterNot { failedPackages.contains(it.packageName) }

            if (suspended) {
                saveSuspendedPackages(affectedTargets.map { it.packageName }.toSet())
            } else {
                val stillSuspended = targets
                    .filter { failedPackages.contains(it.packageName) }
                    .map { it.packageName }
                    .toSet()
                saveSuspendedPackages(stillSuspended)
            }

            blockResult(
                supported = true,
                attempted = targets.size,
                affected = affectedTargets.size,
                failed = failedPackages.size,
                appNames = affectedTargets.map { it.appName },
            )
        } catch (_: SecurityException) {
            blockResult(false, targets.size, 0, targets.size, emptyList())
        } catch (_: IllegalArgumentException) {
            blockResult(false, targets.size, 0, targets.size, emptyList())
        }
    }

    private fun discoverBrowsersAndGames(): List<AppBlockTarget> {
        val browserTargets = discoverBrowserPackages()
            .map {
                AppBlockTarget(
                    packageName = it,
                    appName = labelForPackage(it),
                    reason = "browser",
                )
            }
        val gameTargets = discoverGamePackages()
            .filterNot { packageName -> browserTargets.any { it.packageName == packageName } }
            .map {
                AppBlockTarget(
                    packageName = it,
                    appName = labelForPackage(it),
                    reason = "game",
                )
            }

        return (browserTargets + gameTargets)
            .filterNot { it.packageName == packageName }
            .distinctBy { it.packageName }
            .sortedWith(compareBy<AppBlockTarget> { it.reason }.thenBy { it.appName.lowercase() })
    }

    private fun discoverBrowserPackages(): List<String> {
        val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.example.com")).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
        }

        return packageManager.queryIntentActivities(browserIntent, 0)
            .mapNotNull { it.activityInfo?.packageName }
            .filterNot { it == packageName }
            .distinct()
    }

    private fun discoverGamePackages(): List<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return emptyList()
        }

        val launcherIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }

        return packageManager.queryIntentActivities(launcherIntent, 0)
            .mapNotNull { it.activityInfo?.applicationInfo }
            .filter { it.enabled && it.category == ApplicationInfo.CATEGORY_GAME }
            .map { it.packageName }
            .filterNot { it == packageName }
            .distinct()
    }

    private fun saveSuspendedPackages(packageNames: Set<String>) {
        getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(suspendedPackagesKey, packageNames)
            .apply()
    }

    private fun blockResult(
        supported: Boolean,
        attempted: Int,
        affected: Int,
        failed: Int,
        appNames: List<String>,
    ): Map<String, Any> {
        return mapOf(
            "supported" to supported,
            "attempted" to attempted,
            "affected" to affected,
            "failed" to failed,
            "appNames" to appNames,
        )
    }

    private fun loadUsageReport(minutes: Int): List<Map<String, Any>> {
        if (!hasUsageAccess()) {
            return emptyList()
        }

        val now = System.currentTimeMillis()
        val start = now - minutes.coerceAtLeast(1) * 60_000L
        val usageStatsManager =
            getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val stats = usageStatsManager.queryAndAggregateUsageStats(start, now)

        return stats.values
            .filter { it.totalTimeInForeground > 0 }
            .sortedByDescending { it.totalTimeInForeground }
            .take(12)
            .map { it.toReportMap() }
    }

    private fun UsageStats.toReportMap(): Map<String, Any> {
        val minutesUsed = (totalTimeInForeground / 60_000L).coerceAtLeast(1)

        return mapOf(
            "packageName" to packageName,
            "appName" to labelForPackage(packageName),
            "minutesUsed" to minutesUsed,
            "lastUsedMillis" to lastTimeUsed,
        )
    }

    private fun labelForPackage(packageName: String): String {
        return try {
            val applicationInfo = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationLabel(applicationInfo).toString()
        } catch (_: PackageManager.NameNotFoundException) {
            packageName
        }
    }

    private fun adminComponent(): ComponentName {
        return ComponentName(this, LykDeviceAdminReceiver::class.java)
    }

    private data class AppBlockTarget(
        val packageName: String,
        val appName: String,
        val reason: String,
    ) {
        fun toMap(): Map<String, Any> {
            return mapOf(
                "packageName" to packageName,
                "appName" to appName,
                "reason" to reason,
            )
        }
    }
}
