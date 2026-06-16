CREATE TABLE IF NOT EXISTS `note_embeddings` (
	`noteId` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`textHash` text NOT NULL,
	`embedding` blob NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `note_embeddings_model_idx` ON `note_embeddings` (`model`);
--> statement-breakpoint
UPDATE `materialization_checkpoint`
SET `lastAppliedLocalSeq` = 0;
--> statement-breakpoint
UPDATE `notes`
SET `materializedYUpdate` = NULL,
	`lastEventLocalSeq` = 0;
