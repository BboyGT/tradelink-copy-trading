import { PrismaClient } from '@prisma/client'
import { isAbsolute, resolve } from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Prisma CLI resolves SQLite URLs relative to prisma/schema.prisma, while a
// standalone Next server may resolve them relative to its launch folder.
// Normalize relative file URLs before creating PrismaClient so both modes use
// the same database file.
if (process.env.DATABASE_URL?.startsWith('file:')) {
  const [databasePath, ...query] = process.env.DATABASE_URL.slice(5).split('?')
  if (databasePath && !isAbsolute(databasePath)) {
    const resolvedPath = resolve(process.cwd(), 'prisma', databasePath)
    process.env.DATABASE_URL = `file:${resolvedPath}${query.length ? `?${query.join('?')}` : ''}`
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
