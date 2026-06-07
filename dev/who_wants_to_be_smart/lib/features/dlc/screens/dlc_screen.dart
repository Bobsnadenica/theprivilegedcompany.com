import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/enums/app_language.dart';
import '../../../core/localization/simple_text.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/joyful_kids_background.dart';
import '../models/dlc_manifest.dart';
import '../providers/dlc_providers.dart';
import '../services/dlc_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DlcScreen — Content Store.
//
// Lists all packs from the remote manifest. Each card shows install status.
// Download progress is managed locally via StreamSubscription so the provider
// stays clean. Long-pressing an installed pack offers deletion.
// ─────────────────────────────────────────────────────────────────────────────
class DlcScreen extends ConsumerStatefulWidget {
  const DlcScreen({super.key});
  static const routeName = '/dlc-store';

  @override
  ConsumerState<DlcScreen> createState() => _DlcScreenState();
}

class _DlcScreenState extends ConsumerState<DlcScreen> {
  /// packId → current progress [0.0, 1.0]
  final Map<String, double> _downloadProgress = {};
  final Map<String, StreamSubscription<double>> _subs = {};

  @override
  void dispose() {
    for (final s in _subs.values) {
      s.cancel();
    }
    super.dispose();
  }

  // ── Download logic ─────────────────────────────────────────────────────────

  void _startDownload(DlcPack pack) {
    if (pack.isComingSoon || pack.downloadUrl.isEmpty) return;
    if (_subs.containsKey(pack.id)) return; // already downloading

    setState(() => _downloadProgress[pack.id] = 0.0);

    final stream = DlcService.instance.downloadPack(pack);

    _subs[pack.id] = stream.listen(
      (progress) => setState(() => _downloadProgress[pack.id] = progress),
      onDone: () {
        setState(() {
          _downloadProgress.remove(pack.id);
          _subs.remove(pack.id);
        });
        ref.read(dlcStoreProvider.notifier).refresh();
      },
      onError: (Object e) {
        setState(() {
          _downloadProgress.remove(pack.id);
          _subs.remove(pack.id);
        });
        if (mounted) {
          final lang = ref.read(localeProvider);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                tr(
                  lang,
                  'Download failed: $e',
                  'Изтеглянето е неуспешно: $e',
                ),
              ),
              backgroundColor: AppTheme.wrong,
            ),
          );
        }
      },
    );
  }

  Future<void> _confirmDelete(DlcPack pack) async {
    final lang = ref.read(localeProvider);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgCard,
        title: Text(
          tr(lang, 'Remove ${pack.name}?', 'Премахни ${pack.name}?'),
          style: GoogleFonts.boogaloo(color: AppTheme.wrong, fontSize: 20),
        ),
        content: Text(
          tr(
            lang,
            'The pack will be deleted from this device. You can re-download it anytime.',
            'Пакетът ще бъде изтрит от това устройство. Можеш да го изтеглиш отново по всяко време.',
          ),
          style: AppTheme.bodyStyle.copyWith(color: AppTheme.textMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(tr(lang, 'Cancel', 'Отказ')),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.wrong),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr(lang, 'Remove', 'Премахни')),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(dlcStoreProvider.notifier).deletePack(pack.id);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final packsAsync = ref.watch(dlcStoreProvider);
    final lang = ref.watch(localeProvider);
    final copy = _DlcCopy.from(lang);

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: JoyfulKidsBackground()),
          Container(
            decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
            child: SafeArea(
              child: Column(
                children: [
                  _StoreHeader(
                    copy: copy,
                    onRefresh: () =>
                        ref.read(dlcStoreProvider.notifier).refresh(),
                  ),
                  Expanded(
                    child: packsAsync.when(
                      loading: () => const Center(
                        child: CircularProgressIndicator(color: AppTheme.gold),
                      ),
                      error: (e, _) => _ErrorView(
                        copy: copy,
                        message: e.toString(),
                        onRetry: () =>
                            ref.read(dlcStoreProvider.notifier).refresh(),
                      ),
                      data: (packs) => packs.isEmpty
                          ? _EmptyStore(copy: copy)
                          : _PackList(
                              copy: copy,
                              packs: packs,
                              downloadProgress: _downloadProgress,
                              onDownload: _startDownload,
                              onDelete: _confirmDelete,
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

class _StoreHeader extends StatelessWidget {
  const _StoreHeader({required this.onRefresh, required this.copy});

  final VoidCallback onRefresh;
  final _DlcCopy copy;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          _GoldBack(onTap: () => Navigator.of(context).pop()),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  copy.storeTitle,
                  style: AppTheme.titleStyle.copyWith(fontSize: 24),
                ),
                Text(
                  copy.downloadSubtitle,
                  style: AppTheme.mutedStyle,
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh_rounded, color: AppTheme.gold),
          ),
        ],
      ),
    );
  }
}

class _PackList extends StatelessWidget {
  const _PackList({
    required this.copy,
    required this.packs,
    required this.downloadProgress,
    required this.onDownload,
    required this.onDelete,
  });

  final _DlcCopy copy;
  final List<DlcPack> packs;
  final Map<String, double> downloadProgress;
  final ValueChanged<DlcPack> onDownload;
  final ValueChanged<DlcPack> onDelete;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: packs.length,
      itemBuilder: (context, i) => _PackCard(
        pack: packs[i],
        copy: copy,
        progress: downloadProgress[packs[i].id],
        onDownload: () => onDownload(packs[i]),
        onDelete: () => onDelete(packs[i]),
      ),
    );
  }
}

class _PackCard extends StatelessWidget {
  const _PackCard({
    required this.pack,
    required this.copy,
    required this.progress,
    required this.onDownload,
    required this.onDelete,
  });

  final DlcPack pack;
  final _DlcCopy copy;
  final double? progress; // null = not downloading
  final VoidCallback onDownload;
  final VoidCallback onDelete;

  bool get _isDownloading => progress != null;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: GestureDetector(
        onLongPress: pack.isInstalled &&
                !_isDownloading &&
                !pack.isComingSoon &&
                pack.id != AppConstants.basePackId
            ? onDelete
            : null,
        child: Container(
          decoration: BoxDecoration(
            color: AppTheme.bgCard,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: pack.isInstalled
                  ? AppTheme.correct.withValues(alpha: 0.4)
                  : AppTheme.bgSurface,
              width: 1.5,
            ),
            boxShadow: AppTheme.cardShadow,
          ),
          child: Column(
            children: [
              // ── Main row ──────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    // Emoji icon
                    Container(
                      width: 54,
                      height: 54,
                      decoration: BoxDecoration(
                        color: AppTheme.bgSurface,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Center(
                        child: Text(
                          pack.iconEmoji,
                          style: const TextStyle(fontSize: 26),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),

                    // Text content
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(pack.name,
                              style: AppTheme.headlineStyle
                                  .copyWith(fontSize: 18)),
                          if (pack.description != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              pack.description!,
                              style: AppTheme.mutedStyle,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              _Chip(
                                '${pack.questionCount}',
                                Icons.quiz_outlined,
                                copy.questionsLabel,
                              ),
                              const SizedBox(width: 8),
                              if (pack.sizeBytes > 0)
                                _Chip(pack.sizeMb, Icons.download_outlined, ''),
                              if (pack.isComingSoon &&
                                  pack.priceLabel.isNotEmpty) ...[
                                const SizedBox(width: 8),
                                _Chip(pack.priceLabel, Icons.euro_rounded, ''),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(width: 10),

                    // Action button / status
                    _isDownloading
                        ? const SizedBox(
                            width: 28,
                            height: 28,
                            child: CircularProgressIndicator(
                              color: AppTheme.gold,
                              strokeWidth: 2.5,
                            ),
                          )
                        : _StatusButton(
                            pack: pack,
                            copy: copy,
                            onDownload: onDownload,
                          ),
                  ],
                ),
              ),

              // ── Download progress bar ─────────────────────────────────
              if (_isDownloading)
                ClipRRect(
                  borderRadius:
                      const BorderRadius.vertical(bottom: Radius.circular(20)),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 6,
                    backgroundColor: AppTheme.bgSurface,
                    valueColor: const AlwaysStoppedAnimation(AppTheme.gold),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusButton extends StatelessWidget {
  const _StatusButton({
    required this.pack,
    required this.onDownload,
    required this.copy,
  });

  final DlcPack pack;
  final VoidCallback onDownload;
  final _DlcCopy copy;

  @override
  Widget build(BuildContext context) {
    if (pack.isComingSoon) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppTheme.gold.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.gold.withValues(alpha: 0.45)),
        ),
        child: Text(
          copy.comingSoon,
          style: AppTheme.mutedStyle.copyWith(
            color: AppTheme.gold,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    if (pack.isInstalled && !pack.hasUpdate) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppTheme.correct.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.correct.withValues(alpha: 0.5)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle, color: AppTheme.correct, size: 14),
            const SizedBox(width: 4),
            Text(
              copy.installed,
              style: GoogleFonts.nunito(
                fontSize: 12,
                color: AppTheme.correct,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: onDownload,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          gradient: pack.hasUpdate
              ? const LinearGradient(
                  colors: [Color(0xFFFF6F00), Color(0xFFFFA000)])
              : AppTheme.goldGradient,
          borderRadius: BorderRadius.circular(10),
          boxShadow: AppTheme.goldGlow,
        ),
        child: Text(
          pack.hasUpdate ? copy.update : copy.free,
          style: GoogleFonts.boogaloo(
            fontSize: 14,
            color: AppTheme.bgDark,
            letterSpacing: 1,
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.icon, this.questionsSuffix);

  final String label;
  final IconData icon;
  final String questionsSuffix;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: AppTheme.textMuted),
        const SizedBox(width: 3),
        Text(
          questionsSuffix.isEmpty ? label : '$label $questionsSuffix',
          style: AppTheme.mutedStyle.copyWith(fontSize: 11),
        ),
      ],
    );
  }
}

class _EmptyStore extends StatelessWidget {
  const _EmptyStore({required this.copy});

  final _DlcCopy copy;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('📦', style: TextStyle(fontSize: 56)),
          const SizedBox(height: 16),
          Text(copy.noPacksTitle, style: AppTheme.headlineStyle),
          const SizedBox(height: 8),
          Text(
            copy.noPacksBody,
            style: AppTheme.mutedStyle,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({
    required this.message,
    required this.onRetry,
    required this.copy,
  });

  final String message;
  final VoidCallback onRetry;
  final _DlcCopy copy;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, color: AppTheme.wrong, size: 48),
            const SizedBox(height: 12),
            Text(copy.loadErrorTitle, style: AppTheme.headlineStyle),
            const SizedBox(height: 8),
            Text(
              message,
              style: AppTheme.mutedStyle,
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(copy.retry),
            ),
          ],
        ),
      ),
    );
  }
}

class _GoldBack extends StatelessWidget {
  const _GoldBack({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppTheme.bgSurface,
          shape: BoxShape.circle,
          border: Border.all(color: AppTheme.gold.withValues(alpha: 0.5)),
        ),
        child: const Icon(Icons.arrow_back_ios_new,
            color: AppTheme.gold, size: 18),
      ),
    );
  }
}

class _DlcCopy {
  const _DlcCopy({
    required this.storeTitle,
    required this.downloadSubtitle,
    required this.questionsLabel,
    required this.comingSoon,
    required this.installed,
    required this.update,
    required this.free,
    required this.noPacksTitle,
    required this.noPacksBody,
    required this.loadErrorTitle,
    required this.retry,
  });

  final String storeTitle;
  final String downloadSubtitle;
  final String questionsLabel;
  final String comingSoon;
  final String installed;
  final String update;
  final String free;
  final String noPacksTitle;
  final String noPacksBody;
  final String loadErrorTitle;
  final String retry;

  factory _DlcCopy.from(AppLanguage lang) => _DlcCopy(
        storeTitle: tr(lang, 'Content Store', 'Магазин за съдържание'),
        downloadSubtitle: tr(lang, 'Download new question packs',
            'Изтегли нови пакети с въпроси'),
        questionsLabel: tr(lang, 'questions', 'въпроса'),
        comingSoon: tr(lang, 'Coming Soon', 'Скоро'),
        installed: tr(lang, 'Installed', 'Инсталирано'),
        update: tr(lang, 'Update', 'Обнови'),
        free: tr(lang, 'FREE', 'БЕЗПЛАТНО'),
        noPacksTitle: tr(lang, 'No packs available', 'Няма налични пакети'),
        noPacksBody: tr(
          lang,
          'Check your internet connection\nand pull to refresh.',
          'Провери интернет връзката си\nи опитай опресняване.',
        ),
        loadErrorTitle:
            tr(lang, 'Could not load store', 'Неуспешно зареждане на магазина'),
        retry: tr(lang, 'Retry', 'Опитай отново'),
      );
}
