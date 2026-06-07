import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ParentGuardStore {
  static const _passwordSaltKey = 'parent_password_salt';
  static const _passwordHashKey = 'parent_password_hash';
  static const _sessionEndsAtKey = 'session_ends_at_millis';
  static const _sessionLockedKey = 'session_locked_until_parent';

  Future<bool> hasParentPassword() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey(_passwordSaltKey) &&
        prefs.containsKey(_passwordHashKey);
  }

  Future<void> setParentPassword(String password) async {
    final prefs = await SharedPreferences.getInstance();
    final salt = _randomSalt();

    await prefs.setString(_passwordSaltKey, salt);
    await prefs.setString(_passwordHashKey, _hashPassword(password, salt));
  }

  Future<bool> verifyParentPassword(String password) async {
    final prefs = await SharedPreferences.getInstance();
    final salt = prefs.getString(_passwordSaltKey);
    final savedHash = prefs.getString(_passwordHashKey);

    if (salt == null || savedHash == null) {
      return false;
    }

    return _hashPassword(password, salt) == savedHash;
  }

  Future<DateTime?> loadSessionEndsAt() async {
    final prefs = await SharedPreferences.getInstance();
    final millis = prefs.getInt(_sessionEndsAtKey);
    if (millis == null) {
      return null;
    }

    return DateTime.fromMillisecondsSinceEpoch(millis);
  }

  Future<void> saveSessionEndsAt(DateTime? endsAt) async {
    final prefs = await SharedPreferences.getInstance();
    if (endsAt == null) {
      await prefs.remove(_sessionEndsAtKey);
      return;
    }

    await prefs.setInt(_sessionEndsAtKey, endsAt.millisecondsSinceEpoch);
  }

  Future<bool> loadSessionLockedUntilParent() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_sessionLockedKey) ?? false;
  }

  Future<void> saveSessionLockedUntilParent(bool locked) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_sessionLockedKey, locked);
  }

  String _randomSalt() {
    final random = Random.secure();
    final bytes = List<int>.generate(24, (_) => random.nextInt(256));
    return base64UrlEncode(bytes);
  }

  String _hashPassword(String password, String salt) {
    final bytes = utf8.encode('$salt:$password');
    return sha256.convert(bytes).toString();
  }
}
