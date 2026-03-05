#!/bin/bash
# Update Vercel environment variables with new Neon credentials

echo "Updating Vercel environment variables..."

vercel env rm DATABASE_URL production development preview -y
vercel env add DATABASE_URL production development preview << INPUT
postgresql://neondb_owner:npg_Y5Pbts4zrZBc@ep-polished-wave-aiccisto-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require
INPUT

vercel env rm POSTGRES_URL production development preview -y
vercel env add POSTGRES_URL production development preview << INPUT
postgresql://neondb_owner:npg_Y5Pbts4zrZBc@ep-polished-wave-aiccisto-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require
INPUT

vercel env rm POSTGRES_URL_NON_POOLING production development preview -y
vercel env add POSTGRES_URL_NON_POOLING production development preview << INPUT
postgresql://neondb_owner:npg_Y5Pbts4zrZBc@ep-polished-wave-aiccisto.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require
INPUT

vercel env rm POSTGRES_PRISMA_URL production development preview -y
vercel env add POSTGRES_PRISMA_URL production development preview << INPUT
postgresql://neondb_owner:npg_Y5Pbts4zrZBc@ep-polished-wave-aiccisto-pooler.c-4.us-east-1.aws.neon.tech/neondb?connect_timeout=15&sslmode=require
INPUT

vercel env rm POSTGRES_HOST production development preview -y
vercel env add POSTGRES_HOST production development preview << INPUT
ep-polished-wave-aiccisto-pooler.c-4.us-east-1.aws.neon.tech
INPUT

vercel env rm POSTGRES_USER production development preview -y
vercel env add POSTGRES_USER production development preview << INPUT
neondb_owner
INPUT

vercel env rm POSTGRES_PASSWORD production development preview -y
vercel env add POSTGRES_PASSWORD production development preview << INPUT
npg_Y5Pbts4zrZBc
INPUT

vercel env rm POSTGRES_DATABASE production development preview -y
vercel env add POSTGRES_DATABASE production development preview << INPUT
neondb
INPUT

vercel env rm NEON_PROJECT_ID production development preview -y
vercel env add NEON_PROJECT_ID production development preview << INPUT
winter-recipe-83657218
INPUT

echo "✓ Environment variables updated!"
echo "Run 'vercel deploy' to apply changes"
