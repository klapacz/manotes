CREATE TABLE `backlinks` (
	`sourceId` text NOT NULL,
	`targetId` text NOT NULL,
	PRIMARY KEY(`sourceId`, `targetId`)
);
--> statement-breakpoint
CREATE INDEX `backlinks_target_id_idx` ON `backlinks` (`targetId`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`localSeq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`noteId` text NOT NULL,
	`isDaily` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`payload` blob NOT NULL,
	`createdAt` text NOT NULL,
	`id` text NOT NULL,
	`commitSeq` integer
);
--> statement-breakpoint
INSERT INTO `__new_events`("localSeq", "noteId", "isDaily", "type", "payload", "createdAt", "id", "commitSeq") SELECT "localSeq", "noteId", "isDaily", "type", "payload", "createdAt", "id", "commitSeq" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_commitSeq_unique` ON `events` (`commitSeq`);--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`isDaily` integer DEFAULT 0 NOT NULL,
	`materializedYUpdate` blob,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`lastEventLocalSeq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_notes`("id", "title", "content", "isDaily", "materializedYUpdate", "createdAt", "updatedAt", "lastEventLocalSeq") SELECT "id", "title", "content", "isDaily", "materializedYUpdate", "createdAt", "updatedAt", "lastEventLocalSeq" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;