CREATE TABLE `note` (
	`id` text PRIMARY KEY NOT NULL,
	`content` blob NOT NULL,
	`sv` blob NOT NULL,
	`vector_clock` text NOT NULL,
	`daily_at` text
);
