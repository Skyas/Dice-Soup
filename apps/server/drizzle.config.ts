import type { Config } from 'drizzle-kit';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL ?? 'file:./data/dice-soup.db';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbUrl,
  },
} satisfies Config;
