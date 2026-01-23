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

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  database: new Pool({ connectionString }),
  emailAndPassword: {
    enabled: true,
    // Require email verification for new accounts
    requireEmailVerification: false, // Can enable later if needed
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes cache
    },
  },
  // Trust the host header from Vercel
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
    "https://*.vercel.app",
  ],
});

export default auth;
