# Security Verification Checklist

This checklist should be reviewed before deploying to production and periodically thereafter.

## Clerk Dashboard Verification

Access your Clerk Dashboard at: https://dashboard.clerk.com

### Authentication Settings
- [ ] **Allowed redirect URLs**: Only contains production domain and localhost for dev
  - Production: `https://your-app.vercel.app`
  - Development: `http://localhost:5173`, `http://localhost:3000`
  - Remove any unused or test URLs
- [ ] **Unused authentication methods**: Disable any auth methods not in use
- [ ] **Email verification**: Enable "Require email verification" if appropriate for your app

### JWT Templates
- [ ] Verify no sensitive claims are being added to tokens
- [ ] Check token lifetime is reasonable (default 60 minutes is typically fine)
- [ ] No custom session claims expose internal data

### Users
- [ ] Review users with elevated roles (admin, super_admin)
- [ ] Get the Clerk User ID for your super admin: Dashboard -> Users -> Select user -> Copy User ID
- [ ] Add this ID to `INITIAL_SUPER_ADMIN_CLERK_ID` environment variable in Vercel

### Sessions
- [ ] Review session lifetime settings (default is reasonable)
- [ ] Consider enabling "Single session mode" if users should only be logged in on one device

### Webhooks (if used)
- [ ] Webhook signing secret is set
- [ ] Webhook endpoint validates signatures
- [ ] Webhook endpoint is not publicly guessable

---

## Vercel Dashboard Verification

Access your Vercel Dashboard at: https://vercel.com/dashboard

### Environment Variables

Navigate to: Project Settings -> Environment Variables

| Variable | Production | Preview | Development | Notes |
|----------|------------|---------|-------------|-------|
| `CLERK_SECRET_KEY` | ✓ Required | ✓ Required | ✓ Required | Server-side only, never expose |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✓ Required | ✓ Required | ✓ Required | Safe for client-side |
| `POSTGRES_URL` | ✓ Auto | ✓ Auto | Manual | Provided by Vercel Postgres |
| `INITIAL_SUPER_ADMIN_CLERK_ID` | ✓ Required | ✓ Optional | ✓ Optional | Clerk user ID of your admin |
| `CLERK_AUTHORIZED_PARTIES` | ✓ Recommended | Optional | Optional | Your production URL |

**Security checks:**
- [ ] `CLERK_SECRET_KEY` is set for all environments
- [ ] `CLERK_SECRET_KEY` is NOT visible in build logs (should be auto-hidden)
- [ ] `POSTGRES_URL` is properly configured via Vercel Storage
- [ ] `INITIAL_SUPER_ADMIN_CLERK_ID` is set with the correct Clerk user ID
- [ ] `CLERK_AUTHORIZED_PARTIES` includes your production URL
- [ ] No `.env.local` or secrets committed to git repository

### Deployment Protection
- [ ] Consider enabling "Vercel Authentication" for preview deployments
- [ ] Or use password protection for preview URLs
- [ ] Production deployments are protected by your app's auth

### Security Headers
After deploying the updated `vercel.json`:
- [ ] Verify `X-Frame-Options: DENY` is set (check via browser DevTools -> Network)
- [ ] Verify `X-Content-Type-Options: nosniff` is set
- [ ] Verify API routes have `Cache-Control: no-store, max-age=0`

Use this tool to verify headers: https://securityheaders.com/

### Functions (Serverless)
- [ ] Check function timeout settings (30s default is fine for most cases)
- [ ] Monitor for any unusually long-running or high-error-rate functions
- [ ] Review function logs for any sensitive data being logged

### Logs
- [ ] Review logs for any sensitive data being logged
- [ ] Ensure passwords, tokens, or secrets are not appearing in logs
- [ ] Set up log draining if needed for compliance

---

## Database Security

### Vercel Postgres
- [ ] Connection uses SSL (default with Vercel Postgres)
- [ ] Database is only accessible via Vercel's internal network
- [ ] Consider enabling connection pooling for production

### Data Isolation
- [ ] User sketches are scoped by `user_id` (verified in code)
- [ ] Admin users can only see users in their organization
- [ ] Super admin access is properly restricted

---

## Quick Security Test

After deploying, verify these manually:

1. **Unauthenticated API access**:
   ```bash
   curl https://your-app.vercel.app/api/sketches
   # Should return 401 Unauthorized
   ```

2. **Rate limiting**:
   ```bash
   # Make 101+ requests in 1 minute
   for i in {1..105}; do curl -s -o /dev/null -w "%{http_code}\n" https://your-app.vercel.app/api/sketches; done
   # Should see 429 responses after ~100 requests
   ```

3. **Security headers**:
   ```bash
   curl -I https://your-app.vercel.app
   # Should see X-Frame-Options, X-Content-Type-Options, etc.
   ```

4. **API caching headers**:
   ```bash
   curl -I https://your-app.vercel.app/api/user-role
   # Should see Cache-Control: no-store, max-age=0
   ```

---

## Post-Deployment Monitoring

Set up alerts for:
- [ ] 401/403 error rate spikes (potential attack attempts)
- [ ] 500 error rate increases (application issues)
- [ ] Unusual API call patterns (possible abuse)
- [ ] Failed authentication attempts (brute force detection)

Consider using:
- Vercel Analytics for performance monitoring
- Sentry or similar for error tracking
- Clerk's built-in security logs for auth events
