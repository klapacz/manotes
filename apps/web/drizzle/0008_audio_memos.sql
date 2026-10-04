CREATE TABLE `recordings` (
	`path` text PRIMARY KEY NOT NULL,
	`recordedAt` text NOT NULL,
	`mimeType` text NOT NULL,
	`state` text NOT NULL,
	`noteId` text
);
