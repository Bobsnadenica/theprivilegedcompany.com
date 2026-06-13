class BackendConfig {
  const BackendConfig._();

  // Release builds can override any of these with --dart-define without
  // forcing a source edit for staging vs production.
  static const String awsRegion = String.fromEnvironment(
    'AWS_REGION',
    defaultValue: 'eu-west-2',
  );

  static const String cognitoUserPoolId = String.fromEnvironment(
    'COGNITO_USER_POOL_ID',
    defaultValue: 'eu-west-2_ORdu8sqG1',
  );
  static const String cognitoUserPoolClientId = String.fromEnvironment(
    'COGNITO_USER_POOL_CLIENT_ID',
    defaultValue: '579drfqkb4uueotbod29qq7cs7',
  );

  static const String appSyncApiId = String.fromEnvironment(
    'APPSYNC_API_ID',
    defaultValue: 'xuhhcjmpkremxcv2vrzpgxfrlm',
  );
  static const String appSyncGraphqlUrl = String.fromEnvironment(
    'APPSYNC_GRAPHQL_URL',
    defaultValue:
        'https://3focrrhosbd7dkxtkthji467tu.appsync-api.eu-west-2.amazonaws.com/graphql',
  );

  static const String cloudFrontApprovedDomain = String.fromEnvironment(
    'CLOUDFRONT_APPROVED_DOMAIN',
    defaultValue: 'd2op1xtsiy6g50.cloudfront.net',
  );
  static const String cloudFrontSharedTilesDomain = String.fromEnvironment(
    'CLOUDFRONT_SHARED_TILES_DOMAIN',
    defaultValue: 'd2jmlw6i9yl338.cloudfront.net',
  );

  static const String defaultWorldId = String.fromEnvironment(
    'DEFAULT_WORLD_ID',
    defaultValue: 'global',
  );

  static const String pendingLandmarkBucketName = String.fromEnvironment(
    'PENDING_LANDMARK_BUCKET_NAME',
    defaultValue: 'world-of-fog-prod-010419877195-eu-west-2-pending',
  );
  static const String approvedLandmarkBucketName = String.fromEnvironment(
    'APPROVED_LANDMARK_BUCKET_NAME',
    defaultValue: 'world-of-fog-prod-010419877195-eu-west-2-approved',
  );

  static const String userDiscoveriesTableName = String.fromEnvironment(
    'USER_DISCOVERIES_TABLE_NAME',
    defaultValue: 'world-of-fog-prod-user-discoveries',
  );
  static const String sharedCellsTableName = String.fromEnvironment(
    'SHARED_CELLS_TABLE_NAME',
    defaultValue: 'world-of-fog-prod-shared-cells',
  );
  static const String playerPresenceTableName = String.fromEnvironment(
    'PLAYER_PRESENCE_TABLE_NAME',
    defaultValue: 'world-of-fog-prod-player-presence',
  );
  static const String landmarksTableName = String.fromEnvironment(
    'LANDMARKS_TABLE_NAME',
    defaultValue: 'world-of-fog-prod-landmarks',
  );

  static final List<String> cognitoGroupNames = String.fromEnvironment(
    'COGNITO_GROUP_NAMES',
    defaultValue: 'admin,moderator,user',
  )
      .split(',')
      .map((group) => group.trim())
      .where((group) => group.isNotEmpty)
      .toList(growable: false);
}
