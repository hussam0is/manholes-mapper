/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints using Web Standard API.
 * Vercel's modern Node.js runtime uses fetch-style handlers
 * (Request → Response), not the legacy (req, res) format.
 *
 * auth.handler is Better Auth's native Web API handler that takes
 * a standard Request and returns a Response — no body parsing issues.
 */

import { auth } from "../../lib/auth.js";

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    try {
      const response = await auth.handler(request);
      return response;
    } catch (error) {
      console.error('[Auth API] Error:', error.message || error);
      return new Response(
        JSON.stringify({ error: error.message || 'Internal server error' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
