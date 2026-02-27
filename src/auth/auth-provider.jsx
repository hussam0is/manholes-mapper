/**
 * Better Auth UI Components
 *
 * Custom authentication UI components for Better Auth.
 * Provides SignIn, SignUp, and UserButton components.
 * All strings use window.t() for i18n support.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { signInWithEmail, signUpWithEmail, signOutUser, getCurrentSession } from './auth-client.js';
import { refreshSession } from './auth-guard.js';

// Keep track of React roots to avoid multiple createRoot calls on the same container
const roots = new Map();

/** Helper: get translated string, fallback to key */
function tt(key, ...args) {
  if (typeof window.t === 'function') return window.t(key, ...args);
  return key;
}

/**
 * Get or create a React root for a container
 * @param {HTMLElement} container
 * @returns {Object} React root
 */
function getRoot(container) {
  if (roots.has(container)) {
    return roots.get(container);
  }
  const root = createRoot(container);
  roots.set(container, root);
  return root;
}

/**
 * SignIn Form Component
 */
function SignInForm({ onSuccess, signUpUrl = '#/signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: signInError } = await signInWithEmail(email, password);

      if (signInError) {
        setError(signInError.message || tt('auth.signInFailed'));
        setLoading(false);
        return;
      }

      // Refresh session to update auth state
      await refreshSession();

      if (onSuccess) {
        onSuccess(data);
      } else {
        window.location.hash = '#/';
      }
    } catch (err) {
      setError(err.message || tt('auth.unexpectedError'));
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-form-title">{tt('auth.signIn')}</h2>
        <p className="auth-form-subtitle">{tt('auth.enterCredentials')}</p>

        {error && (
          <div className="auth-form-error">
            <span className="material-icons">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="auth-form-field">
          <label htmlFor="email">{tt('auth.email')}</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tt('auth.emailPlaceholder')}
            required
            disabled={loading}
          />
        </div>

        <div className="auth-form-field">
          <label htmlFor="password">{tt('auth.password')}</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tt('auth.passwordPlaceholder')}
            required
            disabled={loading}
          />
        </div>

        <button type="submit" className="auth-form-submit" disabled={loading}>
          {loading ? (
            <>
              <span className="material-icons spin">sync</span>
              <span>{tt('auth.signingIn')}</span>
            </>
          ) : (
            <span>{tt('auth.signIn')}</span>
          )}
        </button>

        <p className="auth-form-footer">
          {tt('auth.noAccount')}{' '}
          <a href={signUpUrl} className="auth-form-link">{tt('auth.signUp')}</a>
        </p>
      </form>
    </div>
  );
}

/**
 * SignUp Form Component
 */
function SignUpForm({ onSuccess, signInUrl = '#/login' }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(tt('auth.passwordsNoMatch'));
      return;
    }

    if (password.length < 8) {
      setError(tt('auth.passwordTooShort'));
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await signUpWithEmail(email, password, name);

      if (signUpError) {
        setError(signUpError.message || tt('auth.signUpFailed'));
        setLoading(false);
        return;
      }

      // Refresh session to update auth state
      await refreshSession();

      if (onSuccess) {
        onSuccess(data);
      } else {
        window.location.hash = '#/';
      }
    } catch (err) {
      setError(err.message || tt('auth.unexpectedError'));
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-form-title">{tt('auth.createAccount')}</h2>
        <p className="auth-form-subtitle">{tt('auth.signUpToStart')}</p>

        {error && (
          <div className="auth-form-error">
            <span className="material-icons">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="auth-form-field">
          <label htmlFor="name">{tt('auth.name')}</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tt('auth.namePlaceholder')}
            required
            disabled={loading}
          />
        </div>

        <div className="auth-form-field">
          <label htmlFor="signup-email">{tt('auth.email')}</label>
          <input
            type="email"
            id="signup-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tt('auth.emailPlaceholder')}
            required
            disabled={loading}
          />
        </div>

        <div className="auth-form-field">
          <label htmlFor="signup-password">{tt('auth.password')}</label>
          <input
            type="password"
            id="signup-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tt('auth.passwordMinLength')}
            required
            disabled={loading}
            minLength={8}
          />
        </div>

        <div className="auth-form-field">
          <label htmlFor="confirm-password">{tt('auth.confirmPassword')}</label>
          <input
            type="password"
            id="confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={tt('auth.confirmPasswordPlaceholder')}
            required
            disabled={loading}
          />
        </div>

        <button type="submit" className="auth-form-submit" disabled={loading}>
          {loading ? (
            <>
              <span className="material-icons spin">sync</span>
              <span>{tt('auth.creatingAccount')}</span>
            </>
          ) : (
            <span>{tt('auth.signUp')}</span>
          )}
        </button>

        <p className="auth-form-footer">
          {tt('auth.haveAccount')}{' '}
          <a href={signInUrl} className="auth-form-link">{tt('auth.signIn')}</a>
        </p>
      </form>
    </div>
  );
}

/**
 * Mount the SignIn component to a DOM element
 * @param {HTMLElement} container - The container to mount SignIn into
 * @param {Object} props - Optional properties
 */
export function mountSignIn(container, props = {}) {
  if (!container) return;

  const root = getRoot(container);
  root.render(
    React.createElement(SignInForm, {
      signUpUrl: '#/signup',
      ...props
    })
  );
}

/**
 * Mount the SignUp component to a DOM element
 * @param {HTMLElement} container - The container to mount SignUp into
 * @param {Object} props - Optional properties
 */
export function mountSignUp(container, props = {}) {
  if (!container) return;

  const root = getRoot(container);
  root.render(
    React.createElement(SignUpForm, {
      signInUrl: '#/login',
      ...props
    })
  );
}

/**
 * Unmount auth component from a container
 * @param {HTMLElement} container
 */
export function unmountAuth(container) {
  if (!container) return;

  if (roots.has(container)) {
    const root = roots.get(container);
    root.unmount();
    roots.delete(container);
  }
}

// Export components for direct use
export { SignInForm, SignUpForm };
