CREATE TABLE `note` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	`content` blob NOT NULL,
	`sv` blob NOT NULL,
	`daily_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
