ALTER TABLE `events` ADD `id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `commitSeq` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_commitSeq_unique` ON `events` (`commitSeq`);