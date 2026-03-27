ALTER TABLE `events` RENAME COLUMN "id" TO "localSeq";--> statement-breakpoint
ALTER TABLE `events` RENAME COLUMN "timestamp" TO "createdAt";--> statement-breakpoint
ALTER TABLE `materialization_checkpoint` RENAME COLUMN "lastAppliedEventId" TO "lastAppliedLocalSeq";--> statement-breakpoint
ALTER TABLE `notes` RENAME COLUMN "lastEventId" TO "lastEventLocalSeq";