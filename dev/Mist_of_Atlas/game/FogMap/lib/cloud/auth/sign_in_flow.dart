enum SignInOutcome {
  signedIn,
  newPasswordRequired,
}

class PendingNewPasswordChallenge {
  const PendingNewPasswordChallenge({
    required this.email,
    required this.requiredAttributes,
  });

  final String email;
  final List<String> requiredAttributes;

  bool get requiresDisplayName =>
      requiredAttributes.contains('name') ||
      requiredAttributes.contains('custom:display_name');

  bool get requiresProfileIcon =>
      requiredAttributes.contains('custom:profile_icon');
}
