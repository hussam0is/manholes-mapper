/**
 * Better Auth Server Configuration
 * 
 * Authentication using Better Auth with Neon Postgres.
 * Uses the existing Vercel/Neon Postgres connection.
 */

import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

// Use the existing Neon Postgres connection from Vercel
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Determine the base URL
const getBaseURL = () => {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
};

const baseURL = getBaseURL();

// Log configuration for debugging (only in non-production)
if (process.env.NODE_ENV !== 'production') {
  console.log('[Auth] Initializing Better Auth with:', {
    hasSecret: !!process.env.BETTER_AUTH_SECRET,
    hasDbConnection: !!connectionString,
    baseURL,
    vercelUrl: process.env.VERCEL_URL,
  });
}

export const auth = betterAuth({
  secret: (() => {
    if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
    if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('BETTER_AUTH_SECRET environment variable is required in production');
    }
    console.warn('[Auth] WARNING: Using default dev secret. Set BETTER_AUTH_SECRET for production.');
    return 'dev-secret-change-in-production';
  })(),
  baseURL,
  basePath: "/api/auth",
  database: new Pool({ connectionString }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes cache
    },
  },
  trustedOrigins: (() => {
    const origins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ["*"];
    // Always trust the Capacitor native app origin
    if (!origins.includes("*") && !origins.includes("https://localhost")) {
      origins.push("https://localhost");
    }
    return origins;
  })(),
  advanced: {
    generateId: () => crypto.randomUUID(),
    // Cross-origin cookies for Capacitor native app (https://localhost → production API)
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});

export default auth;
