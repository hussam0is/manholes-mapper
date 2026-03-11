/**
 * Better Auth UI Components
 *
 * Custom authentication UI components for Better Auth.
 * Provides SignIn, SignUp, and UserButton components.
 * All strings use window.t() for i18n support.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { signInWithEmail, signUpWithEmail, signOutUser, getCurrentSession } from './auth-client.js';
import { refreshSession } from './auth-guard.js';
import { isRTL } from '../i18n.js';

// Keep track of React roots to avoid multiple createRoot calls on the same container
const roots = new Map();

/** Helper: get translated string, fallback to key */
function tt(key, ...args) {
  if (typeof window.t === 'function') return window.t(key, ...args);
  return key;
}

/**
 * Map known server error messages to i18n keys.
 * Better Auth returns English error strings; we translate common ones
 * so the login/signup UX stays in the user's chosen language.
 */
const SERVER_ERROR_MAP = {
  'invalid email or password': 'auth.signInFailed',
  'invalid credentials': 'auth.signInFailed',
  'user not found': 'auth.signInFailed',
  'user already exists': 'auth.signUpFailed',
  'email already in use': 'auth.signUpFailed',
};

function translateServerError(serverMessage, fallbackKey) {
  if (!serverMessage) return tt(fallbackKey);
  const lower = serverMessage.toLowerCase().trim();
  const mapped = SERVER_ERROR_MAP[lower];
  if (mapped) return tt(mapped);
  // Unknown server error -- return as-is
  return serverMessage;
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

  const handleInvalid = useCallback((e) => {
    const input = e.target;
    if (input.validity.valueMissing) {
      input.setCustomValidity(tt('validation.required'));
    } else if (input.validity.tooShort && minLength) {
      input.setCustomValidity(tt('validation.minLength', minLength));
    } else {
      input.setCustomValidity('');
    }
  }, [minLength]);

  const handleInput = useCallback((e) => {
    e.target.setCustomValidity('');
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
          onInvalid={handleInvalid}
          onInput={handleInput}
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
          <span className="material-icons" aria-hidden="true">
            {visible ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * Language toggle for login/signup pages.
 * Works both when the main app menu is loaded and on the bare login page.
 */
function LanguageToggle() {
  const [, setTick] = useState(0);

  const toggleLanguage = useCallback(() => {
    const currentLang = document.documentElement.lang || 'he';
    const newLang = currentLang === 'he' ? 'en' : 'he';

    // 1. Update global state that the translator reads
    try { window.currentLang = newLang; } catch (_) { /* */ }
    localStorage.setItem('lang', newLang);

    // 2. Update <html> lang + dir
    document.documentElement.lang = newLang;
    document.documentElement.dir = isRTL(newLang) ? 'rtl' : 'ltr';
    document.body.classList.toggle('rtl', isRTL(newLang));

    // 3. Try the main-app language selector (id="langSelect", data-action="languageChange")
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
      langSelect.value = newLang;
      langSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 4. Also try menuEvents if available (handles applyLangToStaticUI, etc.)
    if (window.menuEvents && typeof window.menuEvents.emit === 'function') {
      window.menuEvents.emit('languageChange', { value: newLang, element: langSelect });
    }

    // 5. Update the login panel wrapper text (outside React)
    //    Detect whether we are on signup or login to use the correct i18n keys
    const isOnSignup = (location.hash || '').includes('/signup');
    const loginTitle = document.getElementById('loginTitle');
    const loginSubtitle = document.getElementById('loginSubtitle');
    if (loginTitle) loginTitle.textContent = tt(isOnSignup ? 'auth.signupTitle' : 'auth.loginTitle');
    if (loginSubtitle) loginSubtitle.textContent = tt(isOnSignup ? 'auth.signupSubtitle' : 'auth.loginSubtitle');

    // 6. Force React re-render so all tt() calls pick up the new language
    setTick(t => t + 1);
  }, []);

  const currentLang = document.documentElement.lang || 'he';
  const targetLabel = currentLang === 'he' ? 'English' : '\u05E2\u05D1\u05E8\u05D9\u05EA';

  return (
    <div className="auth-lang-toggle">
      <button type="button" onClick={toggleLanguage} aria-label={tt('auth.switchLanguage')}>
        <span className="material-icons" aria-hidden="true">translate</span>
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
        setError(translateServerError(signInError.message, 'auth.signInFailed'));
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
            <span className="material-icons" aria-hidden="true">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="auth-form-field">
          <label htmlFor="email">{tt('auth.email')}</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
            onInvalid={(e) => {
              const input = e.target;
              if (input.validity.valueMissing) input.setCustomValidity(tt('validation.required'));
              else if (input.validity.typeMismatch) input.setCustomValidity(tt('validation.email'));
              else input.setCustomValidity('');
            }}
            onInput={(e) => e.target.setCustomValidity('')}
            placeholder={tt('auth.emailPlaceholder')}
            required
            disabled={loading}
            autoComplete="email"
          />
        </div>

        <PasswordField
          id="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
          placeholder={tt('auth.passwordPlaceholder')}
          disabled={loading}
          autoComplete="current-password"
          label={tt('auth.password')}
        />

        <button type="submit" className="auth-form-submit" disabled={loading}>
          {loading ? (
            <>
              <span className="material-icons spin" aria-hidden="true">sync</span>
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
  const formRef = useRef(null);

  // Scroll the closest scrollable ancestor (auth-form-wrapper) to top on mount
  // so the Name field is always visible, especially in landscape where the form
  // wrapper has overflow-y: auto and scrollHeight > clientHeight.
  useEffect(() => {
    if (!formRef.current) return;
    const wrapper = formRef.current.closest('.auth-form-wrapper');
    if (wrapper) {
      wrapper.scrollTop = 0;
    }
  }, []);

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
        setError(translateServerError(signUpError.message, 'auth.signUpFailed'));
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
      <form ref={formRef} onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-form-title">{tt('auth.createAccount')}</h2>
        <p className="auth-form-subtitle">{tt('auth.signUpToStart')}</p>

        {error && (
          <div className="auth-form-error" role="alert" aria-live="assertive">
            <span className="material-icons" aria-hidden="true">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="auth-form-field">
          <label htmlFor="name">{tt('auth.name')}</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(''); }}
            onInvalid={(e) => {
              if (e.target.validity.valueMissing) e.target.setCustomValidity(tt('validation.required'));
              else e.target.setCustomValidity('');
            }}
            onInput={(e) => e.target.setCustomValidity('')}
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
            onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
            onInvalid={(e) => {
              const input = e.target;
              if (input.validity.valueMissing) input.setCustomValidity(tt('validation.required'));
              else if (input.validity.typeMismatch) input.setCustomValidity(tt('validation.email'));
              else input.setCustomValidity('');
            }}
            onInput={(e) => e.target.setCustomValidity('')}
            placeholder={tt('auth.emailPlaceholder')}
            required
            disabled={loading}
            autoComplete="email"
          />
        </div>

        <PasswordField
          id="signup-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
          placeholder={tt('auth.passwordMinLength')}
          disabled={loading}
          autoComplete="new-password"
          minLength={8}
          label={tt('auth.password')}
        />

        <PasswordField
          id="confirm-password"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError(''); }}
          placeholder={tt('auth.confirmPasswordPlaceholder')}
          disabled={loading}
          autoComplete="new-password"
          label={tt('auth.confirmPassword')}
        />

        <button type="submit" className="auth-form-submit" disabled={loading}>
          {loading ? (
            <>
              <span className="material-icons spin" aria-hidden="true">sync</span>
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

  // Reset scroll position so form starts at top (landscape signup may have scrolled)
  container.scrollTop = 0;

  const root = getRoot(container);
  root.render(
    React.createElement(SignInForm, {
      signUpUrl: '#/signup',
      ...props
    })
  );

  // After React renders, ensure scroll is at top
  requestAnimationFrame(() => { container.scrollTop = 0; });
}

/**
 * Mount the SignUp component to a DOM element
 * @param {HTMLElement} container - The container to mount SignUp into
 * @param {Object} props - Optional properties
 */
export function mountSignUp(container, props = {}) {
  if (!container) return;

  // Reset scroll position so Name field (first field) is visible at top.
  // Use both immediate and deferred reset: immediate clears any stale
  // scroll from the login form, deferred ensures React has rendered.
  container.scrollTop = 0;

  const root = getRoot(container);
  root.render(
    React.createElement(SignUpForm, {
      signInUrl: '#/login',
      ...props
    })
  );

  // After React renders, ensure scroll is at top.
  // Use double-rAF: first rAF fires after React commits to DOM,
  // second rAF fires after the browser has laid out the new content.
  requestAnimationFrame(() => {
    container.scrollTop = 0;
    requestAnimationFrame(() => { container.scrollTop = 0; });
  });
}

/**
 * Unmount auth component from a container.
 * Clears DOM children after unmounting so createRoot starts fresh.
 * @param {HTMLElement} container
 */
export function unmountAuth(container) {
  if (!container) return;

  if (roots.has(container)) {
    const root = roots.get(container);
    root.unmount();
    roots.delete(container);
    // Clear any orphaned DOM nodes left by React so the next createRoot starts clean
    container.textContent = '';
  }
}

// Export components for direct use
export { SignInForm, SignUpForm };
