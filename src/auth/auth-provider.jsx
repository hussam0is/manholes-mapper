/**
 * Better Auth UI Components
 * 
 * Custom authentication UI components for Better Auth.
 * Replaces Clerk's SignIn, SignUp, and UserButton components.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { signInWithEmail, signUpWithEmail, signOutUser, getCurrentSession } from './auth-client.js';
import { refreshSession } from './auth-guard.js';

// Keep track of React roots to avoid multiple createRoot calls on the same container
const roots = new Map();

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
        setError(signInError.message || 'Sign in failed. Please check your credentials.');
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
      setError(err.message || 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-form-title">Sign In</h2>
        <p className="auth-form-subtitle">Enter your credentials to continue</p>
        
        {error && (
          <div className="auth-form-error">
            <span className="material-icons">error</span>
            <span>{error}</span>
          </div>
        )}
        
        <div className="auth-form-field">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={loading}
          />
        </div>
        
        <div className="auth-form-field">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            disabled={loading}
          />
        </div>
        
        <button type="submit" className="auth-form-submit" disabled={loading}>
          {loading ? (
            <>
              <span className="material-icons spin">sync</span>
              <span>Signing in...</span>
            </>
          ) : (
            <span>Sign In</span>
          )}
        </button>
        
        <p className="auth-form-footer">
          Don't have an account?{' '}
          <a href={signUpUrl} className="auth-form-link">Sign up</a>
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
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await signUpWithEmail(email, password, name);
      
      if (signUpError) {
        setError(signUpError.message || 'Sign up failed. Please try again.');
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
      setError(err.message || 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-form-title">Create Account</h2>
        <p className="auth-form-subtitle">Sign up to get started</p>
        
        {error && (
          <div className="auth-form-error">
            <span className="material-icons">error</span>
            <span>{error}</span>
          </div>
        )}
        
        <div className="auth-form-field">
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            disabled={loading}
          />
        </div>
        
        <div className="auth-form-field">
          <label htmlFor="signup-email">Email</label>
          <input
            type="email"
            id="signup-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={loading}
          />
        </div>
        
        <div className="auth-form-field">
          <label htmlFor="signup-password">Password</label>
          <input
            type="password"
            id="signup-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            disabled={loading}
            minLength={8}
          />
        </div>
        
        <div className="auth-form-field">
          <label htmlFor="confirm-password">Confirm Password</label>
          <input
            type="password"
            id="confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            required
            disabled={loading}
          />
        </div>
        
        <button type="submit" className="auth-form-submit" disabled={loading}>
          {loading ? (
            <>
              <span className="material-icons spin">sync</span>
              <span>Creating account...</span>
            </>
          ) : (
            <span>Sign Up</span>
          )}
        </button>
        
        <p className="auth-form-footer">
          Already have an account?{' '}
          <a href={signInUrl} className="auth-form-link">Sign in</a>
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
