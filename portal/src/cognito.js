// Thin wrapper around amazon-cognito-identity-js: SRP login (password never
// leaves the browser in clear) plus the first-login FORCE_CHANGE_PASSWORD flow.
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';

const cfg = window.__PORTAL_CONFIG__;

const userPool = new CognitoUserPool({
  UserPoolId: cfg.userPoolId,
  ClientId: cfg.userPoolClientId,
});

export function signIn(email, password) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const details = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    user.authenticateUser(details, {
      onSuccess: (session) => resolve({ status: 'OK', session, user }),
      onFailure: (err) => reject(err),
      newPasswordRequired: (userAttributes) => {
        // Cognito rejects these read-only attributes on the challenge response.
        delete userAttributes.email_verified;
        delete userAttributes.email;
        resolve({ status: 'NEW_PASSWORD_REQUIRED', user, userAttributes });
      },
    });
  });
}

export function completeNewPassword(user, newPassword, userAttributes) {
  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(newPassword, userAttributes || {}, {
      onSuccess: (session) => resolve({ status: 'OK', session, user }),
      onFailure: (err) => reject(err),
    });
  });
}

// Restore a session from the previous visit (tokens live in localStorage).
export function getSession() {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err, session) => {
      if (err || !session || !session.isValid()) return resolve(null);
      resolve({ session, user });
    });
  });
}

export function signOut() {
  const user = userPool.getCurrentUser();
  if (user) user.signOut();
}

export function idToken(session) {
  return session.getIdToken().getJwtToken();
}
