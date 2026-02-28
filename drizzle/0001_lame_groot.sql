CREATE TABLE `materialization_checkpoint` (
	`id` integer PRIMARY KEY NOT NULL,
	`lastAppliedEventId` integer NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `notes` ADD `materializedYUpdate` blob;--> statement-breakpoint
ALTER TABLE `notes` ADD `lastEventId` integer DEFAULT 0 NOT NULL;