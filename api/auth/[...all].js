/**
 * API Route: /api/auth/*
 * 
 * Catch-all route for Better Auth endpoints.
 * Handles: signIn, signUp, signOut, session, etc.
 */

import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";

export const config = {
  runtime: 'nodejs',
};

export default toNodeHandler(auth);
