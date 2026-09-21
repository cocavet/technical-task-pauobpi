ALTER TABLE "lead" ADD COLUMN "companyWebsite" TEXT;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentStatus" TEXT;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentProvider" TEXT;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentError" TEXT;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentRequestId" TEXT;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentRunId" TEXT;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentStartedAt" DATETIME;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichedAt" DATETIME;
