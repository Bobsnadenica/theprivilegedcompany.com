import 'package:flutter/material.dart';

import '../../cloud/auth/sign_in_flow.dart';
import '../../cloud/models/landmark_models.dart';
import '../../controllers/app_controller.dart';
import '../../core/utils/journey_insights.dart';
import '../../core/constants/profile_icon_catalog.dart';
import '../../core/utils/stat_formatters.dart';
import '../widgets/armory_profile_view.dart';
import '../widgets/fantasy_panel.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.controller});

  final AppController controller;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmNewPasswordController = TextEditingController();
  final _confirmEmailController = TextEditingController();
  final _confirmCodeController = TextEditingController();
  final _nameFocusNode = FocusNode();
  String? _selectedProfileIcon;
  bool _profileIconDirty = false;
  String? _boundProfileId;
  String? _boundSessionEmail;
  bool? _boundSignedIn;
  String? _boundPendingChallengeEmail;

  @override
  void initState() {
    super.initState();
    _rebindProfileDrafts(force: true);
  }

  @override
  void dispose() {
    _nameFocusNode.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _newPasswordController.dispose();
    _confirmNewPasswordController.dispose();
    _confirmEmailController.dispose();
    _confirmCodeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        _rebindProfileDrafts();
        _syncNameController();
        _syncProfileIconSelection();
        final controller = widget.controller;
        final journeyInsights = controller.journeyInsights;
        final canChangeDisplayName = controller.canChangeDisplayName;
        final canChangeProfileIcon = controller.canChangeProfileIcon;

        return Scaffold(
          appBar: AppBar(title: const Text('Hero')),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildAuthPanel(context, controller),
              const SizedBox(height: 14),
              ArmoryProfileView(
                controller: controller,
                journeyInsights: journeyInsights,
                onSelectHeroArchetype: controller.setHeroArchetype,
                onSetGearSlotEquipped: controller.setGearSlotEquipped,
              ),
              const SizedBox(height: 14),
              _buildIdentityPanel(
                context,
                controller,
                canChangeDisplayName: canChangeDisplayName,
                canChangeProfileIcon: canChangeProfileIcon,
              ),
              const SizedBox(height: 14),
              _buildRecentExpeditionsPanel(context, journeyInsights),
              const SizedBox(height: 14),
              _buildSharePanel(context, journeyInsights),
              if (controller.isAdminOrModerator) ...[
                const SizedBox(height: 14),
                _buildAdminPanel(context),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildIdentityPanel(
    BuildContext context,
    AppController controller, {
    required bool canChangeDisplayName,
    required bool canChangeProfileIcon,
  }) {
    return FantasyPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Banner Hall',
            subtitle:
                'Keep your working account details, but frame them like heraldry instead of raw settings.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _nameController,
            focusNode: _nameFocusNode,
            enabled: canChangeDisplayName,
            decoration: const InputDecoration(labelText: 'Display name'),
          ),
          if (controller.isSignedIn && !canChangeDisplayName)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                'Cloud display name is locked after your first change.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: canChangeDisplayName
                ? () => _runAction(
                      () => controller.setDisplayName(
                        _nameController.text,
                      ),
                      successMessage: 'Banner name updated.',
                    )
                : null,
            icon: const Icon(Icons.draw_outlined),
            label: const Text('Save banner name'),
          ),
          const SizedBox(height: 18),
          Text(
            'Map icon',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            'This remains the icon other adventurers see on the shared map.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 168),
            child: SingleChildScrollView(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: ProfileIconCatalog.options.map((icon) {
                  return ChoiceChip(
                    label: Text(
                      icon,
                      style: const TextStyle(fontSize: 22),
                    ),
                    selected: _selectedProfileIcon == icon,
                    onSelected: canChangeProfileIcon
                        ? (_) => setState(() {
                              _selectedProfileIcon = icon;
                              _profileIconDirty =
                                  icon != controller.profile.profileIcon;
                            })
                        : null,
                  );
                }).toList(growable: false),
              ),
            ),
          ),
          if (controller.isSignedIn && !canChangeProfileIcon)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                'Cloud profile icon is locked after your first change.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: canChangeProfileIcon
                ? () => _saveProfileIcon(controller)
                : null,
            icon: const Icon(Icons.auto_awesome),
            label: const Text('Save crest'),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentExpeditionsPanel(
    BuildContext context,
    JourneyInsights journeyInsights,
  ) {
    final expeditions =
        journeyInsights.expeditions.take(4).toList(growable: false);

    return FantasyPanel(
      background: const [
        Color(0xEE1A1510),
        Color(0xEE15110D),
        Color(0xEE10161C),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Campaign Log',
            subtitle:
                'Your recent real-world expeditions, kept as a field journal.',
          ),
          const SizedBox(height: 12),
          if (expeditions.isEmpty)
            Text(
              'No expeditions logged yet. Start walking and your atlas will begin to record them.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ...expeditions.map(
            (expedition) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _ExpeditionCard(expedition: expedition),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAuthPanel(BuildContext context, AppController controller) {
    if (controller.isSignedIn) {
      return FantasyPanel(
        background: const [
          Color(0xEE162016),
          Color(0xEE16281B),
          Color(0xEE11161B),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionHeader(
              title: 'Cloud Account',
              subtitle:
                  'Keep the working account flow intact while the Atlas becomes more game-like.',
            ),
            const SizedBox(height: 12),
            _DetailRow(
              label: 'Signed in as',
              value: controller.signedInEmail ?? '',
            ),
            _DetailRow(
              label: 'Role',
              value: controller.isAdminOrModerator ? 'admin/moderator' : 'user',
            ),
            _DetailRow(
              label: 'Shared map visibility',
              value: 'Visible only while the app is open and tracking',
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () => _runAction(controller.signOut),
              icon: const Icon(Icons.logout),
              label: const Text('Sign out'),
            ),
          ],
        ),
      );
    }

    final pendingChallenge = controller.pendingNewPasswordChallenge;
    if (pendingChallenge != null) {
      return FantasyPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionHeader(
              title: 'Set Permanent Password',
              subtitle:
                  'This account was created by an administrator and must set a permanent password before it can sign in.',
            ),
            const SizedBox(height: 12),
            _DetailRow(
              label: 'Account',
              value: pendingChallenge.email,
            ),
            if (pendingChallenge.requiredAttributes.isNotEmpty) ...[
              _DetailRow(
                label: 'Required attributes',
                value: pendingChallenge.requiredAttributes.join(', '),
              ),
              const SizedBox(height: 8),
            ],
            TextField(
              controller: _newPasswordController,
              obscureText: true,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(
                labelText: 'New permanent password',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _confirmNewPasswordController,
              obscureText: true,
              textInputAction: TextInputAction.done,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(
                labelText: 'Confirm permanent password',
              ),
            ),
            const SizedBox(height: 10),
            if (pendingChallenge.requiresDisplayName)
              Text(
                'This account also requires a display name. The current identity value will be used.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            if (pendingChallenge.requiresProfileIcon)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'This account also requires a profile icon. The selected icon above will be used.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: () =>
                        _handleCompleteNewPasswordChallenge(controller),
                    child: const Text('Set password and sign in'),
                  ),
                ),
                const SizedBox(width: 10),
                OutlinedButton(
                  onPressed: controller.cancelPendingSignInChallenge,
                  child: const Text('Cancel'),
                ),
              ],
            ),
          ],
        ),
      );
    }

    return FantasyPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Cloud Sign-In',
            subtitle:
                'Sign in to restore progress, enter the shared world, and submit landmarks.',
          ),
          const SizedBox(height: 12),
          AutofillGroup(
            child: Column(
              children: [
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  enableSuggestions: false,
                  autofillHints: const [
                    AutofillHints.username,
                    AutofillHints.email,
                  ],
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  textInputAction: TextInputAction.done,
                  autocorrect: false,
                  enableSuggestions: false,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(labelText: 'Password'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: _handleSignIn,
                  child: const Text('Sign in'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _runAction(
                    () async {
                      await widget.controller.signUp(
                        email: _emailController.text,
                        password: _passwordController.text,
                        displayName: _nameController.text,
                        profileIcon: _selectedProfileIcon ??
                            widget.controller.profile.profileIcon,
                      );
                      _confirmEmailController.text = _emailController.text;
                    },
                    successMessage: 'Account created. Confirm the code below.',
                  ),
                  child: const Text('Sign up'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _confirmEmailController,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(labelText: 'Confirm email'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _confirmCodeController,
            textInputAction: TextInputAction.done,
            decoration: const InputDecoration(labelText: 'Confirmation code'),
          ),
          const SizedBox(height: 10),
          FilledButton.tonal(
            onPressed: () => _runAction(
              () => widget.controller.confirmSignUp(
                email: _confirmEmailController.text,
                code: _confirmCodeController.text,
              ),
              successMessage: 'Account confirmed. Now sign in.',
            ),
            child: const Text('Confirm sign-up'),
          ),
        ],
      ),
    );
  }

  Widget _buildSharePanel(
    BuildContext context,
    JourneyInsights journeyInsights,
  ) {
    final latestExpedition = journeyInsights.latestExpedition;
    final latestExpeditionLabel = latestExpedition == null
        ? 'No expeditions saved yet.'
        : 'Latest expedition: ${_formatExpeditionDateRange(context, latestExpedition)}';

    return FantasyPanel(
      background: const [
        Color(0xEE1C160F),
        Color(0xEE17120D),
        Color(0xEE10161B),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Atlas Archive',
            subtitle:
                'Export a portable snapshot of your explored world and journey archive.',
          ),
          const SizedBox(height: 12),
          Text(
            latestExpeditionLabel,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => _runAction(widget.controller.share),
            icon: const Icon(Icons.ios_share),
            label: const Text('Export atlas snapshot'),
          ),
        ],
      ),
    );
  }

  String _formatExpeditionDateRange(
    BuildContext context,
    ExpeditionSession expedition,
  ) {
    final localizations = MaterialLocalizations.of(context);
    final start = expedition.startedAt.toLocal();
    final end = expedition.endedAt.toLocal();
    final date = localizations.formatMediumDate(start);
    final startTime = localizations.formatTimeOfDay(
      TimeOfDay.fromDateTime(start),
    );
    final endTime = localizations.formatTimeOfDay(
      TimeOfDay.fromDateTime(end),
    );
    return '$date • $startTime-$endTime';
  }

  Widget _buildAdminPanel(BuildContext context) {
    return FantasyPanel(
      background: const [
        Color(0xEE22160F),
        Color(0xEE18120C),
        Color(0xEE11161B),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Moderation',
            subtitle: 'Review pending landmark submissions.',
          ),
          const SizedBox(height: 12),
          FilledButton.tonalIcon(
            onPressed: () async {
              await widget.controller.loadPendingLandmarks();
            },
            icon: const Icon(Icons.refresh),
            label: const Text('Load pending landmarks'),
          ),
          const SizedBox(height: 12),
          if (widget.controller.pendingLandmarks.isEmpty)
            Text(
              'No pending landmarks loaded.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ...widget.controller.pendingLandmarks.map(
            (item) => Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _PendingLandmarkCard(
                item: item,
                controller: widget.controller,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _syncNameController() {
    if (_nameFocusNode.hasFocus) return;

    final displayName = widget.controller.profile.displayName;
    if (_nameController.text == displayName) return;

    _nameController.value = TextEditingValue(
      text: displayName,
      selection: TextSelection.collapsed(offset: displayName.length),
    );
  }

  void _syncProfileIconSelection() {
    if (_profileIconDirty) return;
    if (_selectedProfileIcon == widget.controller.profile.profileIcon) return;
    _selectedProfileIcon = widget.controller.profile.profileIcon;
  }

  void _rebindProfileDrafts({bool force = false}) {
    final profileId = widget.controller.profile.id;
    final sessionEmail = widget.controller.signedInEmail;
    final signedIn = widget.controller.isSignedIn;
    final pendingChallengeEmail =
        widget.controller.pendingNewPasswordChallenge?.email;
    final changed = force ||
        _boundProfileId != profileId ||
        _boundSessionEmail != sessionEmail ||
        _boundSignedIn != signedIn ||
        _boundPendingChallengeEmail != pendingChallengeEmail;

    if (!changed) return;

    _boundProfileId = profileId;
    _boundSessionEmail = sessionEmail;
    _boundSignedIn = signedIn;
    _boundPendingChallengeEmail = pendingChallengeEmail;
    _profileIconDirty = false;

    final displayName = widget.controller.profile.displayName;
    _nameController.value = TextEditingValue(
      text: displayName,
      selection: TextSelection.collapsed(offset: displayName.length),
    );
    _selectedProfileIcon = widget.controller.profile.profileIcon;

    if (signedIn) {
      _passwordController.clear();
      _confirmCodeController.clear();
    }
    _newPasswordController.clear();
    _confirmNewPasswordController.clear();
  }

  Future<void> _handleSignIn() async {
    try {
      final outcome = await widget.controller.signIn(
        email: _emailController.text,
        password: _passwordController.text,
      );
      if (!mounted) return;
      switch (outcome) {
        case SignInOutcome.signedIn:
          _showSnackBar('Signed in successfully.');
          break;
        case SignInOutcome.newPasswordRequired:
          _showSnackBar(
            'A permanent password is required for this account. Set it below to continue.',
          );
          break;
      }
    } catch (e) {
      if (!mounted) return;
      _showSnackBar(e.toString());
    }
  }

  Future<void> _handleCompleteNewPasswordChallenge(
    AppController controller,
  ) async {
    final newPassword = _newPasswordController.text;
    final confirmPassword = _confirmNewPasswordController.text;

    if (newPassword.isEmpty) {
      _showSnackBar('Please enter a new permanent password.');
      return;
    }
    if (newPassword != confirmPassword) {
      _showSnackBar('The new password and confirmation do not match.');
      return;
    }

    try {
      await controller.completeNewPasswordChallenge(
        newPassword: newPassword,
        displayName: _nameController.text,
        profileIcon: _selectedProfileIcon ?? controller.profile.profileIcon,
      );
      if (!mounted) return;
      _showSnackBar('Password updated and account signed in.');
    } catch (e) {
      if (!mounted) return;
      _showSnackBar(e.toString());
    }
  }

  Future<void> _saveProfileIcon(AppController controller) async {
    try {
      await controller.setProfileIcon(
        _selectedProfileIcon ?? controller.profile.profileIcon,
      );
      if (!mounted) return;
      setState(() {
        _profileIconDirty = false;
      });
      _showSnackBar('Profile icon saved.');
    } catch (e) {
      if (!mounted) return;
      _showSnackBar(e.toString());
    }
  }

  Future<void> _runAction(
    Future<void> Function() action, {
    String? successMessage,
  }) async {
    try {
      await action();
      if (!mounted) return;
      if (successMessage != null && successMessage.isNotEmpty) {
        _showSnackBar(successMessage);
      }
    } catch (e) {
      if (!mounted) return;
      _showSnackBar(e.toString());
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 4),
        Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFFE2C58F),
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ExpeditionCard extends StatelessWidget {
  const _ExpeditionCard({
    required this.expedition,
  });

  final ExpeditionSession expedition;

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final start = expedition.startedAt.toLocal();
    final end = expedition.endedAt.toLocal();
    final dateLabel = localizations.formatMediumDate(start);
    final timeRange =
        '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(start))} - '
        '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(end))}';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0x18120E0A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x1FD6B36A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  dateLabel,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              Text(
                timeRange,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: const Color(0xFFBCA587),
                    ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _ExpeditionStatChip(
                icon: Icons.route,
                label: StatFormatters.distanceKm(
                  expedition.distanceMeters / 1000,
                  fractionDigits: 1,
                ),
              ),
              _ExpeditionStatChip(
                icon: Icons.grid_view_rounded,
                label: '${expedition.discoveredCellCount} cells',
              ),
              _ExpeditionStatChip(
                icon: Icons.auto_awesome,
                label: '${expedition.revealCount} marks',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ExpeditionStatChip extends StatelessWidget {
  const _ExpeditionStatChip({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0x22150F0B),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0x22D6B36A)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: const Color(0xFFE2C58F)),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: const Color(0xFFE2C58F),
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

class _PendingLandmarkCard extends StatelessWidget {
  const _PendingLandmarkCard({
    required this.item,
    required this.controller,
  });

  final PendingLandmark item;
  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0x18120E0A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x1FD6B36A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 4),
          Text(item.description),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    final url = await controller.getPendingLandmarkReviewUrl(
                      item.landmarkId,
                    );
                    if (!context.mounted) return;
                    showDialog<void>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: Text(item.title),
                        content: Image.network(url),
                      ),
                    );
                  },
                  child: const Text('Preview'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: () async {
                    await controller.moderateLandmark(
                      landmarkId: item.landmarkId,
                      approve: true,
                    );
                  },
                  child: const Text('Approve'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.tonal(
                  onPressed: () async {
                    await controller.moderateLandmark(
                      landmarkId: item.landmarkId,
                      approve: false,
                    );
                  },
                  child: const Text('Reject'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
