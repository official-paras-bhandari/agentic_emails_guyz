-- Redefine foreign keys with ON DELETE CASCADE
ALTER TABLE "EmailDraftVersion" DROP CONSTRAINT IF EXISTS "EmailDraftVersion_emailDraftId_fkey";
ALTER TABLE "EmailDraftVersion" ADD CONSTRAINT "EmailDraftVersion_emailDraftId_fkey" FOREIGN KEY ("emailDraftId") REFERENCES "EmailDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SendQueue" DROP CONSTRAINT IF EXISTS "SendQueue_draftId_fkey";
ALTER TABLE "SendQueue" ADD CONSTRAINT "SendQueue_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "EmailDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SentEmail" DROP CONSTRAINT IF EXISTS "SentEmail_draftId_fkey";
ALTER TABLE "SentEmail" ADD CONSTRAINT "SentEmail_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "EmailDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailEvent" DROP CONSTRAINT IF EXISTS "EmailEvent_emailId_fkey";
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "SentEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
