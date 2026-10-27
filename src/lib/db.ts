import { PrismaClient } from '@prisma/client'

// Neon PostgreSQL connection URL - hardcoded as fallback to prevent
// system DATABASE_URL (e.g., SQLite) from overriding it. Same verified
// string as .env — the project's own clean database uuu_smm (the old
// neondb production database stays untouched).
const NEON_DATABASE_URL = 'postgresql://neondb_owner:npg_omga5szZAf4l@ep-shiny-paper-aousfq8l-pooler.c-2.ap-southeast-1.aws.neon.tech/uuu_smm?sslmode=require'

// CRITICAL: Always ensure DATABASE_URL points to Neon PostgreSQL.
// System env vars (like SQLite paths) must NOT override this.
const effectiveUrl = process.env.DATABASE_URL?.startsWith('postgresql://')
  ? process.env.DATABASE_URL
  : NEON_DATABASE_URL

// Set it in process.env BEFORE PrismaClient init so schema.prisma env("DATABASE_URL") resolves correctly
process.env.DATABASE_URL = effectiveUrl

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: effectiveUrl,
    },
  },
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
