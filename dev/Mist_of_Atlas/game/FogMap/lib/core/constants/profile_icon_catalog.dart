class ProfileIconCatalog {
  static const String defaultIcon = '🛡️';

  static const List<String> options = [
    '🛡️',
    '⚔️',
    '🏹',
    '🪄',
    '🧭',
    '🗺️',
    '📍',
    '🪙',
    '💎',
    '🔥',
    '🌙',
    '☀️',
    '⭐',
    '👑',
    '🕯️',
    '🌲',
    '⛰️',
    '🌊',
    '🦉',
    '🐺',
    '🦊',
    '🦅',
    '🦁',
    '🐻',
    '🦌',
    '🐲',
    '🍀',
  ];

  static bool isAllowed(String icon) {
    return options.contains(icon);
  }
}
