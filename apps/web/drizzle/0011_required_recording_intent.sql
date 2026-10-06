PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recordings` (
	`path` text PRIMARY KEY NOT NULL,
	`recordedAt` text NOT NULL,
	`mimeType` text NOT NULL,
	`durationMs` integer,
	`state` text NOT NULL,
	`noteId` text NOT NULL,
	`intent` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_recordings`("path", "recordedAt", "mimeType", "durationMs", "state", "noteId", "intent") SELECT "path", "recordedAt", "mimeType", "durationMs", "state", "noteId", "intent" FROM `recordings`;--> statement-breakpoint
DROP TABLE `recordings`;--> statement-breakpoint
ALTER TABLE `__new_recordings` RENAME TO `recordings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;