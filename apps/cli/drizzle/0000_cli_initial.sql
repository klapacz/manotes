CREATE TABLE `backlinks` (
	`sourceId` text NOT NULL,
	`targetId` text NOT NULL,
	PRIMARY KEY(`sourceId`, `targetId`)
);
--> statement-breakpoint
CREATE INDEX `backlinks_target_id_idx` ON `backlinks` (`targetId`);--> statement-breakpoint
CREATE TABLE `events` (
	`localSeq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`noteId` text NOT NULL,
	`type` text NOT NULL,
	`payload` blob NOT NULL,
	`createdAt` text NOT NULL,
	`id` text NOT NULL,
	`commitSeq` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_commitSeq_unique` ON `events` (`commitSeq`);--> statement-breakpoint
CREATE TABLE `materialization_checkpoint` (
	`id` integer PRIMARY KEY NOT NULL,
	`lastAppliedLocalSeq` integer NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
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
