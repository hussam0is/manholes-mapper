/**
 * Better Auth Server Configuration
 * 
 * Replaces Clerk authentication with Neon Auth (Better Auth).
 * Uses the existing Vercel/Neon Postgres connection.
 */

import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

// Use the existing Neon Postgres connection from Vercel
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Build trusted origins list
const trustedOrigins = [];

// Add configured URL
if (process.env.BETTER_AUTH_URL) {
  trustedOrigins.push(process.env.BETTER_AUTH_URL);
}

// Add Vercel preview URLs
if (process.env.VERCEL_URL) {
  trustedOrigins.push(`https://${process.env.VERCEL_URL}`);
}

// Add localhost for development
trustedOrigins.push("http://localhost:3000");
trustedOrigins.push("http://localhost:5173");

// Log configuration for debugging
console.log('[Auth] Initializing Better Auth with:', {
  hasSecret: !!process.env.BETTER_AUTH_SECRET,
  hasDbConnection: !!connectionString,
  baseURL: process.env.BETTER_AUTH_URL || process.env.VERCEL_URL || "http://localhost:3000",
  trustedOrigins,
});

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production",
  baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  basePath: "/api/auth", // This tells Better Auth where the auth routes are mounted
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
  trustedOrigins,
});

export default auth;
