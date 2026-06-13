import 'package:flutter/material.dart';

import 'app.dart';
import 'cloud/auth/cognito_auth_service.dart';
import 'cloud/services/appsync_service.dart';
import 'cloud/services/landmark_upload_service.dart';
import 'cloud/services/shared_tile_service.dart';
import 'controllers/app_controller.dart';
import 'services/local_profile_store.dart';
import 'services/location_service.dart';
import 'services/share_service.dart';
import 'services/shared_map_cache_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final authService = CognitoAuthService();
  final appsyncService = AppSyncService(authService: authService);
  final sharedTileService = SharedTileService();
  final landmarkUploadService = LandmarkUploadService(
    authService: authService,
    appsyncService: appsyncService,
  );

  final controller = AppController(
    localProfileStore: LocalProfileStore(),
    locationService: LocationService(),
    shareService: ShareService(),
    sharedMapCacheStore: SharedMapCacheStore(),
    authService: authService,
    appsyncService: appsyncService,
    landmarkUploadService: landmarkUploadService,
    sharedTileService: sharedTileService,
  );

  runApp(
    MistOfAtlasApp(
      controller: controller,
      initialization: controller.init(),
    ),
  );
}
