-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "decision_note" TEXT,
ADD COLUMN     "payload_json" JSONB;
