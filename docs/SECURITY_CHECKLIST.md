# Security Verification Checklist

This checklist should be reviewed before deploying to production and periodically thereafter.

## Authentication Configuration (Better Auth)

### Authentication Settings
- [ ] **BETTER_AUTH_SECRET**: Ensure a strong, random secret is set (at least 32 characters)
- [ ] **Session lifetime**: Review session duration (default 7 days)
- [ ] **Email verification**: Configure if appropriate for your app

### Users
- [ ] Review users with elevated roles (admin, super_admin)
- [ ] Get the email for your super admin
- [ ] Add this email to `INITIAL_SUPER_ADMIN_EMAIL` environment variable in Vercel

---

## Vercel Dashboard Verification

Access your Vercel Dashboard at: https://vercel.com/dashboard

### Environment Variables

Navigate to: Project Settings -> Environment Variables

| Variable | Production | Preview | Development | Notes |
|----------|------------|---------|-------------|-------|
| `BETTER_AUTH_SECRET` | ✓ Required | ✓ Required | ✓ Required | Server-side only, never expose |
| `POSTGRES_URL` | ✓ Auto | ✓ Auto | Manual | Provided by Vercel Postgres |
| `INITIAL_SUPER_ADMIN_EMAIL` | ✓ Required | ✓ Optional | ✓ Optional | Email of your super admin |
| `BETTER_AUTH_URL` | ✓ Optional | Optional | Optional | Base URL for auth (auto-detected) |

**Security checks:**
- [ ] `BETTER_AUTH_SECRET` is set for all environments
- [ ] `BETTER_AUTH_SECRET` is NOT visible in build logs (should be auto-hidden)
- [ ] `POSTGRES_URL` is properly configured via Vercel Storage
- [ ] `INITIAL_SUPER_ADMIN_EMAIL` is set with the correct email address
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
- Database logs for auth events
