PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`text` text NOT NULL,
	`date` text NOT NULL,
	`materializedYUpdate` blob,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`lastEventLocalSeq` integer NOT NULL
);
--> statement-breakpoint
DELETE FROM `backlinks`;--> statement-breakpoint
DELETE FROM `materialization_checkpoint`;--> statement-breakpoint
PRAGMA foreign_keys=ON;