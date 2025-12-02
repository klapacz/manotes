CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`noteId` text NOT NULL,
	`type` text NOT NULL,
	`payload` blob NOT NULL,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
