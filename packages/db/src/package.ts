// Imports
import { Convoy, PrismaClient } from './prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { extendPrismaClient } from 'prisma-prefixed-ids';
import { ModelName } from './prisma/internal/prismaNamespace.js';

// Singleton storage (Nuxt-safe)
const globalForPrisma = globalThis as unknown as {
	defprisma?: PrismaClient;
	prisma?: PrismaClient;
	adapter?: PrismaPg;
};

// ID Prefixes
const prefixes: Record<ModelName, string> = {
	Convoy: 'cv',
};

// Create or reuse adapter
const adapter = globalForPrisma.adapter ?? new PrismaPg({ connectionString: process.env['DATABASE_URL'] ?? `postgres://${process.env['POSTGRES_USER']}:${process.env['POSTGRES_PASSWORD']}@postgres/${process.env['POSTGRES_DB']}` });

// Create or reuse Prisma client
const defprisma = globalForPrisma.defprisma ?? new PrismaClient({ adapter });

// Create or reuse Extended Prisma Client
export const prisma = globalForPrisma.prisma ?? extendPrismaClient(defprisma, { prefixes });

// Prevent re-instantiation in dev / HMR
if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.defprisma = defprisma;
	globalForPrisma.prisma = prisma;
	globalForPrisma.adapter = adapter;
}

// Re-export generated client types
export * from './prisma/client.js';

// Export DTOs
// TOD: implement DTOViewer
export const DTO = {
	formatConvoy(convoy: Partial<Convoy>) {
		let c: Partial<Convoy> = JSON.parse(JSON.stringify(convoy));
		delete c.organizerPasswordHash;
		return c;
	},
};
