-- CreateEnum
CREATE TYPE "ConvoyStatus" AS ENUM ('DRAFT', 'READY', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Convoy" (
    "id" TEXT NOT NULL,
    "status" "ConvoyStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "accessCode" TEXT NOT NULL,
    "organizerPasswordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Convoy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Convoy_accessCode_key" ON "Convoy"("accessCode");

-- CreateIndex
CREATE UNIQUE INDEX "Convoy_organizerPasswordHash_key" ON "Convoy"("organizerPasswordHash");
