import 'dart:convert';

import 'package:amazon_cognito_identity_dart_2/cognito.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/constants/profile_icon_catalog.dart';
import '../backend_config.dart';
import 'auth_session.dart';
import 'sign_in_flow.dart';

class CognitoAuthService {
  CognitoAuthService()
      : _userPool = CognitoUserPool(
          BackendConfig.cognitoUserPoolId,
          BackendConfig.cognitoUserPoolClientId,
        );

  final CognitoUserPool _userPool;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  static const _emailKey = 'cognito_email';
  static const _idTokenKey = 'cognito_id_token';
  static const _accessTokenKey = 'cognito_access_token';
  static const _refreshTokenKey = 'cognito_refresh_token';
  static const _groupsKey = 'cognito_groups';
  static const _expKey = 'cognito_exp';
  static const _userIdKey = 'cognito_user_id';
  static const _displayNameOverrideKey = 'cognito_display_name_override';
  static const _displayNameLockedKey = 'cognito_display_name_locked';
  static const _profileIconOverrideKey = 'cognito_profile_icon_override';
  static const _profileIconLockedKey = 'cognito_profile_icon_locked';
  static const List<String> _ownedStorageKeys = [
    _emailKey,
    _idTokenKey,
    _accessTokenKey,
    _refreshTokenKey,
    _groupsKey,
    _expKey,
    _userIdKey,
    _displayNameOverrideKey,
    _displayNameLockedKey,
    _profileIconOverrideKey,
    _profileIconLockedKey,
  ];

  AuthSession? _currentSession;
  String? _displayNameOverride;
  bool _displayNameLockedOverride = false;
  String? _profileIconOverride;
  bool _profileIconLockedOverride = false;
  CognitoUser? _pendingChallengeUser;
  PendingNewPasswordChallenge? _pendingNewPasswordChallenge;

  AuthSession? get currentSession => _currentSession;
  PendingNewPasswordChallenge? get pendingNewPasswordChallenge =>
      _pendingNewPasswordChallenge;

  bool get isSignedIn => _currentSession != null;

  Future<void> init() async {
    final email = await _storage.read(key: _emailKey);
    final idToken = await _storage.read(key: _idTokenKey);
    final accessToken = await _storage.read(key: _accessTokenKey);
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    final groupsRaw = await _storage.read(key: _groupsKey);
    final expRaw = await _storage.read(key: _expKey);
    final userId = await _storage.read(key: _userIdKey);
    final displayNameOverride = await _storage.read(
      key: _displayNameOverrideKey,
    );
    final displayNameLocked = await _storage.read(key: _displayNameLockedKey);
    final profileIconOverride =
        await _storage.read(key: _profileIconOverrideKey);
    final profileIconLocked = await _storage.read(key: _profileIconLockedKey);

    if (email == null ||
        userId == null ||
        idToken == null ||
        accessToken == null ||
        refreshToken == null ||
        expRaw == null) {
      _currentSession = null;
      _displayNameOverride = null;
      _displayNameLockedOverride = false;
      _profileIconOverride = null;
      _profileIconLockedOverride = false;
      clearPendingSignInChallenge();
      return;
    }

    _displayNameOverride = displayNameOverride?.trim().isEmpty == true
        ? null
        : displayNameOverride?.trim();
    _displayNameLockedOverride = displayNameLocked == 'true';
    _profileIconOverride = profileIconOverride?.trim().isEmpty == true
        ? null
        : profileIconOverride?.trim();
    _profileIconLockedOverride = profileIconLocked == 'true';

    final groups = groupsRaw == null || groupsRaw.isEmpty
        ? <String>[]
        : (jsonDecode(groupsRaw) as List<dynamic>)
            .map((e) => e.toString())
            .toList();

    final exp = int.tryParse(expRaw) ?? 0;

    _currentSession = AuthSession(
      userId: userId,
      email: email,
      idToken: idToken,
      accessToken: accessToken,
      refreshToken: refreshToken,
      groups: groups,
      expiresAtEpochSeconds: exp,
    );

    if (_currentSession!.isExpired) {
      try {
        await _refreshSession();
      } catch (_) {
        // Keep the stored session and retry refresh lazily on the next
        // authenticated request instead of dropping the user out on startup.
      }
    }
  }

  Future<void> signUp({
    required String email,
    required String password,
    required String displayName,
    required String profileIcon,
  }) async {
    final normalizedEmail = email.trim();
    final normalizedDisplayName = displayName.trim();
    final normalizedProfileIcon = profileIcon.trim();

    try {
      await _userPool.signUp(
        normalizedEmail,
        password,
        userAttributes: [
          AttributeArg(
            name: 'custom:display_name',
            value: normalizedDisplayName,
          ),
          AttributeArg(
            name: 'custom:profile_icon',
            value: normalizedProfileIcon,
          ),
        ],
      );
    } catch (error) {
      if (!_isMissingProfileIconAttributeError(error)) rethrow;
      await _userPool.signUp(
        normalizedEmail,
        password,
        userAttributes: [
          AttributeArg(
            name: 'custom:display_name',
            value: normalizedDisplayName,
          ),
        ],
      );
    }
  }

  Future<void> confirmSignUp({
    required String email,
    required String code,
  }) async {
    // Cognito treats usernames case-insensitively when the pool is configured
    // to use email aliases, but our sign-up trimmed-only path normalises one
    // way and confirm normalised the other. Normalise both consistently.
    final user = CognitoUser(email.trim().toLowerCase(), _userPool);
    await user.confirmRegistration(code.trim());
  }

  Future<SignInOutcome> signIn({
    required String email,
    required String password,
  }) async {
    final normalizedEmail = email.trim();
    final user = CognitoUser(normalizedEmail, _userPool);
    final authDetails = AuthenticationDetails(
      username: normalizedEmail,
      password: password,
    );

    clearPendingSignInChallenge();

    CognitoUserSession? session;
    try {
      session = await user.authenticateUser(authDetails);
    } on CognitoUserNewPasswordRequiredException catch (error) {
      _pendingChallengeUser = user;
      _pendingNewPasswordChallenge = PendingNewPasswordChallenge(
        email: normalizedEmail,
        requiredAttributes: List<String>.from(error.requiredAttributes ?? const []),
      );
      return SignInOutcome.newPasswordRequired;
    }

    if (session == null) {
      throw Exception('Cognito sign-in did not return a session.');
    }

    final authSession = _sessionFromCognitoSession(
      email: normalizedEmail,
      session: session,
      fallbackRefreshToken: '',
    );

    _displayNameOverride = null;
    _displayNameLockedOverride = _extractDisplayNameLocked(authSession.idToken);
    _profileIconOverride = null;
    _profileIconLockedOverride = _extractProfileIconLocked(authSession.idToken);
    await _persist(authSession);
    _currentSession = authSession;
    clearPendingSignInChallenge();
    return SignInOutcome.signedIn;
  }

  Future<SignInOutcome> completeNewPasswordChallenge({
    required String newPassword,
    required String displayName,
    required String profileIcon,
  }) async {
    final challenge = _pendingNewPasswordChallenge;
    final user = _pendingChallengeUser;

    if (challenge == null || user == null) {
      throw Exception('No pending password challenge was found.');
    }

    final normalizedDisplayName = displayName.trim();
    final normalizedProfileIcon = profileIcon.trim();

    final requiredAttributes = <String, String>{};
    for (final attribute in challenge.requiredAttributes) {
      switch (attribute) {
        case 'name':
        case 'custom:display_name':
          if (normalizedDisplayName.isEmpty) {
            throw Exception('A display name is required to complete sign-in.');
          }
          requiredAttributes[attribute] = normalizedDisplayName;
          break;
        case 'custom:profile_icon':
          if (!ProfileIconCatalog.isAllowed(normalizedProfileIcon)) {
            throw Exception(
              'Please choose a valid profile icon before completing sign-in.',
            );
          }
          requiredAttributes[attribute] = normalizedProfileIcon;
          break;
        default:
          throw Exception(
            'This account requires an unsupported attribute before it can sign in: $attribute',
          );
      }
    }

    final session = await user.sendNewPasswordRequiredAnswer(
      newPassword,
      requiredAttributes.isEmpty ? null : requiredAttributes,
    );

    if (session == null) {
      throw Exception('Cognito did not return a session after password update.');
    }

    final authSession = _sessionFromCognitoSession(
      email: challenge.email,
      session: session,
      fallbackRefreshToken: '',
    );

    _displayNameOverride = null;
    _displayNameLockedOverride = _extractDisplayNameLocked(authSession.idToken);
    _profileIconOverride = null;
    _profileIconLockedOverride = _extractProfileIconLocked(authSession.idToken);
    await _persist(authSession);
    _currentSession = authSession;
    clearPendingSignInChallenge();
    return SignInOutcome.signedIn;
  }

  Future<void> signOut() async {
    _currentSession = null;
    _displayNameOverride = null;
    _displayNameLockedOverride = false;
    _profileIconOverride = null;
    _profileIconLockedOverride = false;
    clearPendingSignInChallenge();
    for (final key in _ownedStorageKeys) {
      await _storage.delete(key: key);
    }
  }

  void clearPendingSignInChallenge() {
    _pendingChallengeUser = null;
    _pendingNewPasswordChallenge = null;
  }

  Future<String?> getIdToken() async {
    await ensureValidSession();
    return _currentSession?.idToken;
  }

  String? get currentUserId => _currentSession?.userId;

  String? get currentDisplayName {
    final current = _currentSession;
    if (current == null) return null;

    final override = _displayNameOverride?.trim();
    if (override != null && override.isNotEmpty) {
      return override;
    }

    try {
      final payload = _decodeJwtPayload(current.idToken);
      final customDisplayName =
          payload['custom:display_name']?.toString().trim();
      if (customDisplayName != null && customDisplayName.isNotEmpty) {
        return customDisplayName;
      }

      final name = payload['name']?.toString().trim();
      if (name != null && name.isNotEmpty) {
        return name;
      }
    } catch (_) {
      // Fall back to the signed-in email below.
    }

    return current.email;
  }

  String get currentProfileIcon {
    final current = _currentSession;
    if (current == null) return ProfileIconCatalog.defaultIcon;

    final override = _profileIconOverride?.trim();
    if (override != null && override.isNotEmpty) {
      return override;
    }

    try {
      final payload = _decodeJwtPayload(current.idToken);
      final customProfileIcon =
          payload['custom:profile_icon']?.toString().trim();
      if (customProfileIcon != null &&
          customProfileIcon.isNotEmpty &&
          ProfileIconCatalog.isAllowed(customProfileIcon)) {
        return customProfileIcon;
      }
    } catch (_) {
      // Fall back to the default icon below.
    }

    return ProfileIconCatalog.defaultIcon;
  }

  bool get isDisplayNameLocked {
    final current = _currentSession;
    if (current == null) return false;
    return _displayNameLockedOverride ||
        _extractDisplayNameLocked(current.idToken);
  }

  bool get isProfileIconLocked {
    final current = _currentSession;
    if (current == null) return false;
    return _profileIconLockedOverride ||
        _extractProfileIconLocked(current.idToken);
  }

  Future<String> updateDisplayNameOnce(String displayName) async {
    final current = _currentSession;
    final normalized = displayName.trim();

    if (current == null) {
      throw Exception('Please sign in before updating your display name.');
    }
    if (normalized.length < 3 || normalized.length > 80) {
      throw Exception('Display name must be between 3 and 80 characters.');
    }
    if (isDisplayNameLocked) {
      throw Exception('Display name can only be changed once.');
    }

    final user = CognitoUser(
      current.email,
      _userPool,
      signInUserSession: _toCognitoUserSession(current),
    );

    final updated = await user.updateAttributes([
      CognitoUserAttribute(name: 'custom:display_name', value: normalized),
      CognitoUserAttribute(name: 'custom:display_name_locked', value: 'true'),
    ]);

    if (!updated) {
      throw Exception('Display name update failed.');
    }

    _displayNameOverride = normalized;
    _displayNameLockedOverride = true;
    await _storage.write(key: _displayNameOverrideKey, value: normalized);
    await _storage.write(key: _displayNameLockedKey, value: 'true');

    try {
      await _refreshSession();
    } catch (_) {
      // Keep the local override if Cognito token refresh is delayed.
    }

    return normalized;
  }

  Future<String> updateProfileIconOnce(String profileIcon) async {
    final current = _currentSession;
    final normalized = profileIcon.trim();

    if (current == null) {
      throw Exception('Please sign in before updating your profile icon.');
    }
    if (!ProfileIconCatalog.isAllowed(normalized)) {
      throw Exception('Please choose one of the available profile icons.');
    }
    if (isProfileIconLocked) {
      throw Exception('Profile icon can only be changed once.');
    }

    final user = CognitoUser(
      current.email,
      _userPool,
      signInUserSession: _toCognitoUserSession(current),
    );

    final bool updated;
    try {
      updated = await user.updateAttributes([
        CognitoUserAttribute(name: 'custom:profile_icon', value: normalized),
        CognitoUserAttribute(
          name: 'custom:profile_icon_locked',
          value: 'true',
        ),
      ]);
    } catch (error) {
      if (_isMissingProfileIconAttributeError(error)) {
        throw Exception(
          'Profile icons require the latest backend deployment before they can be changed for signed-in users.',
        );
      }
      rethrow;
    }

    if (!updated) {
      throw Exception('Profile icon update failed.');
    }

    _profileIconOverride = normalized;
    _profileIconLockedOverride = true;
    await _storage.write(key: _profileIconOverrideKey, value: normalized);
    await _storage.write(key: _profileIconLockedKey, value: 'true');

    try {
      await _refreshSession();
    } catch (_) {
      // Keep the local override if Cognito token refresh is delayed.
    }

    return normalized;
  }

  Future<void> ensureValidSession() async {
    if (_currentSession == null) return;
    if (!_currentSession!.isExpired) return;
    await _refreshSession();
  }

  Future<void> _refreshSession() async {
    final current = _currentSession;
    if (current == null) {
      throw Exception('No session available to refresh.');
    }
    if (current.refreshToken.isEmpty) {
      throw Exception('No refresh token available.');
    }

    final user = CognitoUser(current.email, _userPool);
    final refreshToken = CognitoRefreshToken(current.refreshToken);
    final CognitoUserSession? refreshed =
        await user.refreshSession(refreshToken);

    if (refreshed == null) {
      throw Exception('Failed to refresh Cognito session.');
    }

    final next = _sessionFromCognitoSession(
      email: current.email,
      session: refreshed,
      fallbackRefreshToken: current.refreshToken,
    );

    await _persist(next);
    _currentSession = next;
  }

  AuthSession _sessionFromCognitoSession({
    required String email,
    required CognitoUserSession session,
    required String fallbackRefreshToken,
  }) {
    final idToken = session.getIdToken().getJwtToken() ?? '';
    final accessToken = session.getAccessToken().getJwtToken() ?? '';
    final refreshToken =
        session.getRefreshToken()?.getToken() ?? fallbackRefreshToken;

    if (idToken.isEmpty || accessToken.isEmpty) {
      throw Exception('Cognito session returned empty tokens.');
    }

    final groups = _extractGroups(idToken);
    final exp = _extractExp(idToken);
    final userId = _extractSub(idToken);

    return AuthSession(
      userId: userId,
      email: email,
      idToken: idToken,
      accessToken: accessToken,
      refreshToken: refreshToken,
      groups: groups,
      expiresAtEpochSeconds: exp,
    );
  }

  Future<void> _persist(AuthSession session) async {
    await _storage.write(key: _userIdKey, value: session.userId);
    await _storage.write(key: _emailKey, value: session.email);
    await _storage.write(key: _idTokenKey, value: session.idToken);
    await _storage.write(key: _accessTokenKey, value: session.accessToken);
    await _storage.write(key: _refreshTokenKey, value: session.refreshToken);
    await _storage.write(key: _groupsKey, value: jsonEncode(session.groups));
    await _storage.write(
      key: _expKey,
      value: session.expiresAtEpochSeconds.toString(),
    );
  }

  List<String> _extractGroups(String jwt) {
    final payload = _decodeJwtPayload(jwt);
    final raw = payload['cognito:groups'];
    if (raw is List) {
      return raw.map((e) => e.toString()).toList();
    }
    return <String>[];
  }

  int _extractExp(String jwt) {
    final payload = _decodeJwtPayload(jwt);
    final exp = payload['exp'];
    if (exp is int) return exp;
    if (exp is num) return exp.toInt();
    return 0;
  }

  String _extractSub(String jwt) {
    final payload = _decodeJwtPayload(jwt);
    final sub = payload['sub'];
    if (sub is String && sub.isNotEmpty) return sub;
    throw Exception('Cognito token payload did not include a valid sub.');
  }

  bool _extractDisplayNameLocked(String jwt) {
    final payload = _decodeJwtPayload(jwt);
    final raw = payload['custom:display_name_locked'];
    if (raw is bool) return raw;
    if (raw is String) return raw.toLowerCase() == 'true';
    return false;
  }

  bool _extractProfileIconLocked(String jwt) {
    final payload = _decodeJwtPayload(jwt);
    final raw = payload['custom:profile_icon_locked'];
    if (raw is bool) return raw;
    if (raw is String) return raw.toLowerCase() == 'true';
    return false;
  }

  bool _isMissingProfileIconAttributeError(Object error) {
    final text = error.toString().toLowerCase();
    return (text.contains('profile_icon') ||
            text.contains('profile icon') ||
            text.contains('custom:profile_icon')) &&
        (text.contains('invalid') ||
            text.contains('not exist') ||
            text.contains('does not exist') ||
            text.contains('unknown') ||
            text.contains('unsupported'));
  }

  CognitoUserSession _toCognitoUserSession(AuthSession session) {
    return CognitoUserSession(
      CognitoIdToken(session.idToken),
      CognitoAccessToken(session.accessToken),
      refreshToken: CognitoRefreshToken(session.refreshToken),
    );
  }

  Map<String, dynamic> _decodeJwtPayload(String token) {
    final parts = token.split('.');
    if (parts.length < 2) return <String, dynamic>{};
    final normalized = base64Url.normalize(parts[1]);
    final decoded = utf8.decode(base64Url.decode(normalized));
    return Map<String, dynamic>.from(jsonDecode(decoded) as Map);
  }
}
