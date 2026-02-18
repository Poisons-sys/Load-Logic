import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import 'dotenv/config'
import * as schema from './schema'

/**
 * Neon/Drizzle connection.
 * Prefer pooled connection in serverless environments.
 */
const DATABASE_URL =
  process.env.DATABASE_URL_POOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL

if (!DATABASE_URL) {
  throw new Error(
    'Missing DB url. Set DATABASE_URL_POOLED (recommended) or DATABASE_URL (or POSTGRES_URL fallback).'
  )
}

const globalDb = globalThis as unknown as {
  __loadLogicPool?: Pool
}

const pool =
  globalDb.__loadLogicPool ??
  new Pool({
    connectionString: DATABASE_URL,
  })

if (process.env.NODE_ENV !== 'production') {
  globalDb.__loadLogicPool = pool
}

export const db = drizzle(pool, { schema })
