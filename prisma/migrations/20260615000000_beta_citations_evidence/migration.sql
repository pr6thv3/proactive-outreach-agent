ALTER TABLE "Signal" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Signal" ADD COLUMN "sourceTitle" TEXT;
ALTER TABLE "OutreachMessage" ADD COLUMN "evidenceSnapshot" JSONB;
