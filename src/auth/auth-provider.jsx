/**
 * Better Auth UI Components
 *
 * Custom authentication UI components for Better Auth.
 * Provides SignIn, SignUp, and UserButton components.
 * All strings use window.t() for i18n support.
 */

import React, { useState, useCallback } from 'react';
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
 * Password field with show/hide toggle
 */
function PasswordField({ id, value, onChange, placeholder, disabled, autoComplete, minLength, label }) {
  const [visible, setVisible] = useState(false);

  const toggleVisibility = useCallback(() => {
    setVisible(v => !v);
  }, []);

  return (
    <div className="auth-form-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-wrapper">
        <input
          type={visible ? 'text' : 'password'}
          id={id}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required
          disabled={disabled}
          autoComplete={autoComplete}
          minLength={minLength}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={toggleVisibility}
          aria-label={visible ? tt('auth.hidePassword') : tt('auth.showPassword')}
          tabIndex={-1}
        >
          <span className="material-icons">
            {visible ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * Language toggle for login/signup pages
 */
function LanguageToggle() {
  const [, setTick] = useState(0);

  const toggleLanguage = useCallback(() => {
    // Use the global setLanguage function if available (from main-entry.js or i18n.js)
    const currentLang = document.documentElement.lang || 'he';
    const newLang = currentLang === 'he' ? 'en' : 'he';

    // Dispatch language change via the language selector if available
    const langSelect = document.getElementById('languageSelect');
    if (langSelect) {
      langSelect.value = newLang;
      langSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (typeof window.setLanguage === 'function') {
      window.setLanguage(newLang);
    }

    // Force re-render to update translated strings
    setTick(t => t + 1);
  }, []);

  const currentLang = document.documentElement.lang || 'he';
  const targetLabel = currentLang === 'he' ? 'English' : '\u05E2\u05D1\u05E8\u05D9\u05EA';

  return (
    <div className="auth-lang-toggle">
      <button type="button" onClick={toggleLanguage} aria-label={tt('auth.switchLanguage')}>
        <span className="material-icons">translate</span>
        <span>{targetLabel}</span>
      </button>
    </div>
  );
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
          <div className="auth-form-error" role="alert" aria-live="assertive">
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
            autoComplete="email"
          />
        </div>

        <PasswordField
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={tt('auth.passwordPlaceholder')}
          disabled={loading}
          autoComplete="current-password"
          label={tt('auth.password')}
        />

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

        <LanguageToggle />
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
          <div className="auth-form-error" role="alert" aria-live="assertive">
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
            autoComplete="name"
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
            autoComplete="email"
          />
        </div>

        <PasswordField
          id="signup-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={tt('auth.passwordMinLength')}
          disabled={loading}
          autoComplete="new-password"
          minLength={8}
          label={tt('auth.password')}
        />

        <PasswordField
          id="confirm-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={tt('auth.confirmPasswordPlaceholder')}
          disabled={loading}
          autoComplete="new-password"
          label={tt('auth.confirmPassword')}
        />

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

        <LanguageToggle />
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
