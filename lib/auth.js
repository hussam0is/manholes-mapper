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

// Log configuration for debugging
console.log('[Auth] Initializing Better Auth with:', {
  hasSecret: !!process.env.BETTER_AUTH_SECRET,
  hasDbConnection: !!connectionString,
  baseURL,
  vercelUrl: process.env.VERCEL_URL,
});

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production",
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
  // Allow all origins - the API route already handles CORS
  trustedOrigins: ["*"],
  // Use a table prefix to avoid conflicts with existing tables
  advanced: {
    generateId: () => crypto.randomUUID(),
  },
});

export default auth;
