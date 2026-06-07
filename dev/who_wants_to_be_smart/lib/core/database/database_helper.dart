import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

import '../../features/classroom/models/class_profile.dart';
import '../../features/classroom/models/player.dart';
import '../../features/classroom/models/player_progress.dart';
import '../../features/classroom/models/score.dart';
import '../constants/app_constants.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton SQLite helper.
// All public methods are async and throw on unrecoverable errors.
// ─────────────────────────────────────────────────────────────────────────────
class DatabaseHelper {
  DatabaseHelper._();
  static final DatabaseHelper instance = DatabaseHelper._();

  static Database? _db;

  Future<Database> get database async {
    _db ??= await _initDb();
    return _db!;
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  Future<Database> _initDb() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, AppConstants.dbName);

    return openDatabase(
      path,
      version: AppConstants.dbVersion,
      onCreate: _onCreate,
      onConfigure: (db) => db.execute('PRAGMA foreign_keys = ON'),
    );
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE ${AppConstants.tableClasses} (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT    NOT NULL,
        created_at   INTEGER NOT NULL,
        avatar_emoji TEXT    NOT NULL DEFAULT '🌟'
      )
    ''');

    await db.execute('''
      CREATE TABLE ${AppConstants.tablePlayers} (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT    NOT NULL,
        class_id     INTEGER NOT NULL,
        avatar_index INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (class_id)
          REFERENCES ${AppConstants.tableClasses}(id)
          ON DELETE CASCADE
      )
    ''');

    await db.execute('''
      CREATE TABLE ${AppConstants.tableScores} (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id          INTEGER NOT NULL,
        class_id           INTEGER NOT NULL,
        points             INTEGER NOT NULL DEFAULT 0,
        questions_correct  INTEGER NOT NULL DEFAULT 0,
        questions_total    INTEGER NOT NULL DEFAULT 0,
        played_at          INTEGER NOT NULL,
        pack_id            TEXT,
        FOREIGN KEY (player_id)
          REFERENCES ${AppConstants.tablePlayers}(id)
          ON DELETE CASCADE,
        FOREIGN KEY (class_id)
          REFERENCES ${AppConstants.tableClasses}(id)
          ON DELETE CASCADE
      )
    ''');

    await db.execute('''
      CREATE TABLE ${AppConstants.tableQuestionPacks} (
        id               TEXT    PRIMARY KEY,
        name             TEXT    NOT NULL,
        description      TEXT,
        version          INTEGER NOT NULL DEFAULT 1,
        is_installed     INTEGER NOT NULL DEFAULT 0,
        installed_at     INTEGER,
        icon_emoji       TEXT    DEFAULT '📚',
        question_count   INTEGER DEFAULT 0
      )
    ''');

    // Seed the base pack record so it always appears in DLC listings.
    await db.insert(AppConstants.tableQuestionPacks, {
      'id': AppConstants.basePackId,
      'name': AppConstants.basePackName,
      'is_installed': 1,
      'installed_at': DateTime.now().millisecondsSinceEpoch,
      'icon_emoji': '⭐',
      'question_count': AppConstants.basePackQuestionCount,
      'version': 1,
    });
  }

  // ── Class Operations ───────────────────────────────────────────────────────

  Future<int> insertClass(ClassProfile profile) async {
    final db = await database;
    return db.insert(
      AppConstants.tableClasses,
      profile.toMap(),
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<List<ClassProfile>> getAllClasses() async {
    final db = await database;
    final rows = await db.query(
      AppConstants.tableClasses,
      orderBy: 'name ASC',
    );
    return rows.map(ClassProfile.fromMap).toList();
  }

  Future<ClassProfile?> getClassById(int id) async {
    final db = await database;
    final rows = await db.query(
      AppConstants.tableClasses,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    return rows.isEmpty ? null : ClassProfile.fromMap(rows.first);
  }

  Future<ClassProfile?> getClassByName(String name) async {
    final db = await database;
    final rows = await db.query(
      AppConstants.tableClasses,
      where: 'name = ?',
      whereArgs: [name],
      limit: 1,
    );
    return rows.isEmpty ? null : ClassProfile.fromMap(rows.first);
  }

  Future<ClassProfile> findOrCreateClass({
    required String name,
    required String emoji,
  }) async {
    final existing = await getClassByName(name);
    if (existing != null) return existing;

    final profile = ClassProfile(
      name: name,
      createdAt: DateTime.now(),
      avatarEmoji: emoji,
    );
    final id = await insertClass(profile);
    return profile.copyWith(id: id);
  }

  Future<int> updateClass(ClassProfile profile) async {
    final db = await database;
    return db.update(
      AppConstants.tableClasses,
      profile.toMap(),
      where: 'id = ?',
      whereArgs: [profile.id],
    );
  }

  Future<int> deleteClass(int id) async {
    final db = await database;
    // CASCADE deletes players + scores automatically via FK.
    return db.delete(
      AppConstants.tableClasses,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // ── Player Operations ──────────────────────────────────────────────────────

  Future<int> insertPlayer(Player player) async {
    final db = await database;
    return db.insert(AppConstants.tablePlayers, player.toMap());
  }

  /// Returns the existing player for (name, classId) or creates a new one.
  Future<Player> findOrCreatePlayer(String name, int classId) async {
    final db = await database;
    final rows = await db.query(
      AppConstants.tablePlayers,
      where: 'name = ? AND class_id = ?',
      whereArgs: [name, classId],
      limit: 1,
    );
    if (rows.isNotEmpty) return Player.fromMap(rows.first);

    final newPlayer = Player(name: name, classId: classId);
    final id = await db.insert(AppConstants.tablePlayers, newPlayer.toMap());
    return newPlayer.copyWith(id: id);
  }

  Future<List<Player>> getPlayersForClass(int classId) async {
    final db = await database;
    final rows = await db.query(
      AppConstants.tablePlayers,
      where: 'class_id = ?',
      whereArgs: [classId],
      orderBy: 'name ASC',
    );
    return rows.map(Player.fromMap).toList();
  }

  // ── Score Operations ───────────────────────────────────────────────────────

  Future<int> insertScore(Score score) async {
    final db = await database;
    return db.insert(AppConstants.tableScores, score.toMap());
  }

  /// Leaderboard: top N scores for a class, with player name joined in.
  Future<List<Score>> getLeaderboardForClass(
    int classId, {
    int limit = AppConstants.leaderboardSize,
  }) async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT s.*, p.name AS player_name
      FROM   ${AppConstants.tableScores}  s
      JOIN   ${AppConstants.tablePlayers} p ON p.id = s.player_id
      WHERE  s.class_id = ?
      ORDER  BY s.points DESC, s.played_at DESC
      LIMIT  ?
    ''', [classId, limit]);
    return rows.map(Score.fromMap).toList();
  }

  Future<List<Score>> getScoresForPlayer(int playerId) async {
    final db = await database;
    final rows = await db.query(
      AppConstants.tableScores,
      where: 'player_id = ?',
      whereArgs: [playerId],
      orderBy: 'played_at DESC',
    );
    return rows.map(Score.fromMap).toList();
  }

  Future<int?> getBestScoreForPlayer(int playerId) async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT MAX(points) AS best FROM ${AppConstants.tableScores} WHERE player_id = ?',
      [playerId],
    );
    return result.first['best'] as int?;
  }

  /// Leaderboard across all classes.
  Future<List<Score>> getGlobalLeaderboard({
    int limit = AppConstants.leaderboardSize,
  }) async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT s.*, p.name AS player_name, c.name AS class_name
      FROM   ${AppConstants.tableScores} s
      JOIN   ${AppConstants.tablePlayers} p ON p.id = s.player_id
      LEFT JOIN ${AppConstants.tableClasses} c ON c.id = s.class_id
      ORDER  BY s.points DESC, s.played_at DESC
      LIMIT  ?
    ''', [limit]);
    return rows.map(Score.fromMap).toList();
  }

  /// Last player who finished a game (used to open profile quickly on home).
  Future<Player?> getMostRecentPlayer() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT p.*
      FROM   ${AppConstants.tableScores} s
      JOIN   ${AppConstants.tablePlayers} p ON p.id = s.player_id
      ORDER  BY s.played_at DESC
      LIMIT  1
    ''');
    if (rows.isEmpty) return null;
    return Player.fromMap(rows.first);
  }

  Future<PlayerProgress?> getPlayerProgress(int playerId) async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT
        p.id AS player_id,
        p.name AS player_name,
        p.class_id AS class_id,
        c.name AS class_name,
        COALESCE(COUNT(s.id), 0) AS games_played,
        COALESCE(MAX(s.points), 0) AS best_score,
        COALESCE(SUM(s.points), 0) AS total_points,
        COALESCE(SUM(s.questions_correct), 0) AS total_correct,
        COALESCE(SUM(s.questions_total), 0) AS total_questions,
        COALESCE(MAX(s.questions_correct), 0) AS best_correct_run,
        COALESCE(
          SUM(
            CASE
              WHEN s.questions_correct >= ${AppConstants.targetCorrectToWin}
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS wins
      FROM ${AppConstants.tablePlayers} p
      LEFT JOIN ${AppConstants.tableScores} s ON s.player_id = p.id
      LEFT JOIN ${AppConstants.tableClasses} c ON c.id = p.class_id
      WHERE p.id = ?
      GROUP BY p.id, p.name, p.class_id, c.name
      LIMIT 1
    ''', [playerId]);

    if (rows.isEmpty) return null;
    final row = rows.first;
    final classId = _asInt(row['class_id']);

    final globalRank = await _rankForPlayer(
      playerId: playerId,
      classId: null,
    );
    final classRank = await _rankForPlayer(
      playerId: playerId,
      classId: classId,
    );

    return PlayerProgress(
      playerId: _asInt(row['player_id']),
      playerName: row['player_name']?.toString() ?? 'Player',
      classId: classId,
      className: row['class_name']?.toString() ?? 'Class',
      gamesPlayed: _asInt(row['games_played']),
      bestScore: _asInt(row['best_score']),
      totalPoints: _asInt(row['total_points']),
      totalCorrect: _asInt(row['total_correct']),
      totalQuestions: _asInt(row['total_questions']),
      wins: _asInt(row['wins']),
      bestCorrectRun: _asInt(row['best_correct_run']),
      globalRank: globalRank,
      classRank: classRank,
    );
  }

  Future<int> _rankForPlayer({
    required int playerId,
    int? classId,
  }) async {
    final db = await database;
    final where = classId == null ? '' : 'WHERE p.class_id = ?';
    final args = classId == null ? const <Object?>[] : <Object?>[classId];

    final rows = await db.rawQuery('''
      SELECT
        p.id AS player_id,
        COALESCE(MAX(s.points), 0) AS best_points,
        COALESCE(MAX(s.questions_correct), 0) AS best_correct_run,
        COALESCE(MAX(s.played_at), 0) AS last_played
      FROM ${AppConstants.tablePlayers} p
      LEFT JOIN ${AppConstants.tableScores} s ON s.player_id = p.id
      $where
      GROUP BY p.id
      ORDER BY best_points DESC, best_correct_run DESC, last_played DESC, p.id ASC
    ''', args);

    for (var i = 0; i < rows.length; i++) {
      if (_asInt(rows[i]['player_id']) == playerId) return i + 1;
    }
    return rows.length + 1;
  }

  int _asInt(Object? raw) {
    if (raw is int) return raw;
    if (raw is num) return raw.toInt();
    return int.tryParse(raw?.toString() ?? '') ?? 0;
  }

  // ── Pack Operations ────────────────────────────────────────────────────────

  Future<Map<String, Map<String, dynamic>>> getInstalledPacksMap() async {
    final db = await database;
    final rows = await db.query(
      AppConstants.tableQuestionPacks,
      where: 'is_installed = 1',
    );
    return {for (final r in rows) r['id'] as String: r};
  }

  Future<void> upsertPack(Map<String, dynamic> packRow) async {
    final db = await database;
    await db.insert(
      AppConstants.tableQuestionPacks,
      packRow,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Call after a DLC pack is successfully downloaded and extracted.
  Future<void> markPackInstalled(String packId, int version) async {
    final db = await database;
    await db.update(
      AppConstants.tableQuestionPacks,
      {
        'is_installed': 1,
        'installed_at': DateTime.now().millisecondsSinceEpoch,
        'version': version,
      },
      where: 'id = ?',
      whereArgs: [packId],
    );
  }

  // ── Teardown (testing only) ────────────────────────────────────────────────

  Future<void> close() async {
    final db = _db;
    if (db != null) {
      await db.close();
      _db = null;
    }
  }
}
