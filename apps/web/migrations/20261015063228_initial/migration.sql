CREATE TABLE `backlinks` (
	`sourceId` TEXT NOT NULL,
	`targetId` TEXT NOT NULL,
	CONSTRAINT `backlinks_pk` PRIMARY KEY(`sourceId`, `targetId`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`localSeq` integer PRIMARY KEY AUTOINCREMENT,
	`noteId` TEXT NOT NULL,
	`type` TEXT NOT NULL,
	`payload` BLOB NOT NULL,
	`createdAt` TEXT NOT NULL,
	`id` TEXT NOT NULL UNIQUE,
	`commitSeq` INTEGER UNIQUE
);
--> statement-breakpoint
CREATE TABLE `materialization_checkpoint` (
	`id` INTEGER PRIMARY KEY,
	`lastAppliedLocalSeq` INTEGER NOT NULL,
	`updatedAt` TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` TEXT PRIMARY KEY NOT NULL,
	`_tag` TEXT DEFAULT ('note') NOT NULL,
	`prop_type` TEXT,
	`prop_default` TEXT,
	`prop_targets` TEXT,
	`owned_type` TEXT,
	`owned_parent` TEXT,
	`rule_storage` TEXT,
	`rule_targets` TEXT,
	`attrs_valid` INTEGER DEFAULT (0) NOT NULL,
	`title` TEXT,
	`content` TEXT NOT NULL,
	`text` TEXT NOT NULL,
	`date` TEXT NOT NULL,
	`materializedYUpdate` BLOB,
	`createdAt` TEXT NOT NULL,
	`updatedAt` TEXT NOT NULL,
	`lastEventLocalSeq` INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE `props` (
	`recordId` TEXT NOT NULL,
	`path` TEXT NOT NULL,
	`propId` TEXT NOT NULL,
	`value` TEXT,
	CONSTRAINT `props_pk` PRIMARY KEY(`recordId`, `path`, `propId`)
);
--> statement-breakpoint
CREATE TABLE `recordings` (
	`path` TEXT PRIMARY KEY NOT NULL,
	`recordedAt` TEXT NOT NULL,
	`mimeType` TEXT NOT NULL,
	`durationMs` INTEGER,
	`state` TEXT NOT NULL,
	`noteId` TEXT NOT NULL,
	`intent` TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rule_expects` (
	`ruleId` TEXT NOT NULL,
	`propId` TEXT NOT NULL,
	`value` TEXT,
	CONSTRAINT `rule_expects_pk` PRIMARY KEY(`ruleId`, `propId`)
);
--> statement-breakpoint
CREATE INDEX `backlinks_target_id_idx` ON `backlinks` (`targetId`);--> statement-breakpoint
CREATE INDEX `notes_tag_idx` ON `notes` (`_tag`);--> statement-breakpoint
CREATE INDEX `notes_owned_parent_idx` ON `notes` (`owned_parent`);--> statement-breakpoint
CREATE INDEX `props_prop_id_idx` ON `props` (`propId`);--> statement-breakpoint
CREATE INDEX `rule_expects_prop_id_idx` ON `rule_expects` (`propId`);