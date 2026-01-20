/**
 * Clerk Authentication Provider
 * 
 * Wraps the application with Clerk's authentication context.
 * This enables useAuth, useUser, and other Clerk hooks throughout the app.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, SignIn, SignUp, UserButton, useAuth, useUser } from '@clerk/clerk-react';

// Get the publishable key from environment variables
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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

if (!PUBLISHABLE_KEY) {
  console.warn('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable. Auth will not work.');
}

/**
 * Initialize Clerk and render auth UI components
 */
export function initClerkAuth() {
  if (!PUBLISHABLE_KEY) {
    console.error('Clerk publishable key not found. Please set VITE_CLERK_PUBLISHABLE_KEY in .env.local');
    return null;
  }

  return {
    publishableKey: PUBLISHABLE_KEY,
    ClerkProvider,
    SignIn,
    SignUp,
    UserButton,
    useAuth,
    useUser,
  };
}

/**
 * Mount the SignIn component to a DOM element
 * @param {HTMLElement} container - The container to mount SignIn into
 * @param {Object} props - Optional properties for the SignIn component
 */
export function mountSignIn(container, props = {}) {
  if (!container || !PUBLISHABLE_KEY) return;
  
  const root = getRoot(container);
  root.render(
    React.createElement(ClerkProvider, { publishableKey: PUBLISHABLE_KEY },
      React.createElement(SignIn, {
        appearance: {
          elements: {
            rootBox: 'clerk-root-box',
            card: 'clerk-card',
            headerTitle: 'clerk-header-title',
            headerSubtitle: 'clerk-header-subtitle',
            formButtonPrimary: 'clerk-btn-primary',
            footerActionLink: 'clerk-footer-link',
          },
          variables: {
            colorPrimary: '#2563eb',
            colorTextOnPrimaryBackground: '#ffffff',
            borderRadius: '12px',
          },
        },
        routing: 'hash',
        signUpUrl: '#/signup',
        afterSignInUrl: '#/',
        afterSignUpUrl: '#/',
        ...props
      })
    )
  );
}

/**
 * Mount the SignUp component to a DOM element
 * @param {HTMLElement} container - The container to mount SignUp into
 * @param {Object} props - Optional properties for the SignUp component
 */
export function mountSignUp(container, props = {}) {
  if (!container || !PUBLISHABLE_KEY) return;
  
  const root = getRoot(container);
  root.render(
    React.createElement(ClerkProvider, { publishableKey: PUBLISHABLE_KEY },
      React.createElement(SignUp, {
        appearance: {
          elements: {
            rootBox: 'clerk-root-box',
            card: 'clerk-card',
          },
          variables: {
            colorPrimary: '#2563eb',
            colorTextOnPrimaryBackground: '#ffffff',
            borderRadius: '12px',
          },
        },
        routing: 'hash',
        signInUrl: '#/login',
        afterSignInUrl: '#/',
        afterSignUpUrl: '#/',
        ...props
      })
    )
  );
}

/**
 * Mount the UserButton component to a DOM element
 * @param {HTMLElement} container - The container to mount UserButton into
 */
export function mountUserButton(container) {
  if (!container || !PUBLISHABLE_KEY) return;
  
  const root = getRoot(container);
  root.render(
    React.createElement(ClerkProvider, { publishableKey: PUBLISHABLE_KEY },
      React.createElement(UserButton, {
        appearance: {
          elements: {
            avatarBox: 'clerk-avatar',
          },
        },
        afterSignOutUrl: '#/login',
      })
    )
  );
}

// Export Clerk components for direct use
export { ClerkProvider, SignIn, SignUp, UserButton, useAuth, useUser };
export { PUBLISHABLE_KEY };
