import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
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

const sql = neon(DATABASE_URL)
export const db = drizzle(sql, { schema })
