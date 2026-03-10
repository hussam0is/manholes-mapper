/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 * Handles: signIn, signUp, signOut, session, etc.
 *
 * Uses Edge runtime to avoid Vercel's Rust runtime body parsing issues
 * (the Node.js runtime patches IncomingMessage.body with a getter that
 * throws "Invalid JSON" and consumes the stream, making the body
 * inaccessible to better-call's getRequest function).
 */

import { auth } from "../../lib/auth.js";

export const config = {
  runtime: 'edge',
};

export default async function authHandler(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  // Rate limiting: simple per-IP check (in-memory, per-instance)
  const isSignOut = request.url?.includes('/sign-out');
  if (!isSignOut) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limited = checkRateLimit(ip, 20);
    if (limited) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }
  }

  try {
    const response = await auth.handler(request);

    // Add CORS headers to response
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }
}

// --- CORS helpers ---

function corsHeaders(request) {
  const origin = request.headers?.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// --- Simple in-memory rate limiter ---

const rateLimitMap = new Map();
const WINDOW_MS = 60_000;

function checkRateLimit(ip, maxRequests) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  if (entry.count > maxRequests) return true;
  return false;
}
