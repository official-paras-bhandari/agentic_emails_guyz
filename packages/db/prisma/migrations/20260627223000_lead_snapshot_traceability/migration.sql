-- Snapshot-to-lead traceability and source status audit events.

CREATE TABLE "CrawlSnapshot" (
    "id" TEXT NOT NULL,
    "candidateUrlId" TEXT,
    "jobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT,
    "httpStatus" INTEGER,
    "contentHash" TEXT,
    "rawHtmlStorageKey" TEXT,
    "renderedHtmlStorageKey" TEXT,
    "cleanedTextStorageKey" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadSnapshotSource" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "crawlSnapshotId" TEXT NOT NULL,
    "candidateUrlId" TEXT,
    "extractionResultId" TEXT,
    "sourceRole" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSnapshotSource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadSnapshotSource_sourceRole_check" CHECK ("sourceRole" IN (
        'primary_official_site',
        'contact_page',
        'about_page',
        'directory_listing',
        'schema_source',
        'rendered_page',
        'llm_extraction_source'
    )),
    CONSTRAINT "LeadSnapshotSource_evidenceType_check" CHECK ("evidenceType" IN (
        'business_name',
        'email',
        'phone',
        'address',
        'location',
        'industry',
        'services',
        'website'
    ))
);

CREATE TABLE "SourceStatusEvent" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrawlSnapshot_jobId_createdAt_idx" ON "CrawlSnapshot"("jobId", "createdAt");
CREATE INDEX "CrawlSnapshot_candidateUrlId_idx" ON "CrawlSnapshot"("candidateUrlId");
CREATE INDEX "CrawlSnapshot_contentHash_idx" ON "CrawlSnapshot"("contentHash");
CREATE INDEX "CrawlSnapshot_expiresAt_idx" ON "CrawlSnapshot"("expiresAt");

CREATE UNIQUE INDEX "LeadSnapshotSource_leadId_crawlSnapshotId_evidenceType_key" ON "LeadSnapshotSource"("leadId", "crawlSnapshotId", "evidenceType");
CREATE INDEX "LeadSnapshotSource_leadId_idx" ON "LeadSnapshotSource"("leadId");
CREATE INDEX "LeadSnapshotSource_crawlSnapshotId_idx" ON "LeadSnapshotSource"("crawlSnapshotId");
CREATE INDEX "LeadSnapshotSource_candidateUrlId_idx" ON "LeadSnapshotSource"("candidateUrlId");
CREATE INDEX "LeadSnapshotSource_extractionResultId_idx" ON "LeadSnapshotSource"("extractionResultId");
CREATE INDEX "LeadSnapshotSource_sourceRole_evidenceType_idx" ON "LeadSnapshotSource"("sourceRole", "evidenceType");

CREATE INDEX "SourceStatusEvent_sourceId_createdAt_idx" ON "SourceStatusEvent"("sourceId", "createdAt");
CREATE INDEX "SourceStatusEvent_newStatus_createdAt_idx" ON "SourceStatusEvent"("newStatus", "createdAt");

ALTER TABLE "CrawlSnapshot" ADD CONSTRAINT "CrawlSnapshot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadSnapshotSource" ADD CONSTRAINT "LeadSnapshotSource_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadSnapshotSource" ADD CONSTRAINT "LeadSnapshotSource_crawlSnapshotId_fkey" FOREIGN KEY ("crawlSnapshotId") REFERENCES "CrawlSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
