-- CreateTable
CREATE TABLE "ConvoySegment" (
    "id" TEXT NOT NULL,
    "convoyId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,
    "lengthInMeters" DOUBLE PRECISION NOT NULL,
    "durationInMinutes" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConvoySegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvoyPOI" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConvoyPOI_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConvoySegment_convoyId_idx" ON "ConvoySegment"("convoyId");

-- CreateIndex
CREATE UNIQUE INDEX "ConvoyPOI_segmentId_key" ON "ConvoyPOI"("segmentId");

-- AddForeignKey
ALTER TABLE "ConvoySegment" ADD CONSTRAINT "ConvoySegment_convoyId_fkey" FOREIGN KEY ("convoyId") REFERENCES "Convoy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoyPOI" ADD CONSTRAINT "ConvoyPOI_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "ConvoySegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
