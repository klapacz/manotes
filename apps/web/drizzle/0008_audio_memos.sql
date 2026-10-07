CREATE TABLE `recordings` (
	`path` text PRIMARY KEY NOT NULL,
	`recordedAt` text NOT NULL,
	`mimeType` text NOT NULL,
	`durationMs` integer,
	`state` text NOT NULL,
	`noteId` text NOT NULL,
	`intent` text NOT NULL
);
