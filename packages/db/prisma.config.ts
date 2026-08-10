import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
	},
	datasource: {
		url: process.env['DATABASE_URL'] ?? `postgres://${process.env['POSTGRES_USER']}:${process.env['POSTGRES_PASSWORD']}@postgres/${process.env['POSTGRES_DB']}`,
	},
});
