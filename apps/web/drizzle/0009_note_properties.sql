CREATE TABLE `props` (
	`recordId` text NOT NULL,
	`propId` text NOT NULL,
	`value` text,
	PRIMARY KEY(`recordId`, `propId`)
);
--> statement-breakpoint
CREATE INDEX `props_prop_id_idx` ON `props` (`propId`);--> statement-breakpoint
CREATE TABLE `rule_expects` (
	`ruleId` text NOT NULL,
	`propId` text NOT NULL,
	`value` text,
	PRIMARY KEY(`ruleId`, `propId`)
);
--> statement-breakpoint
CREATE INDEX `rule_expects_prop_id_idx` ON `rule_expects` (`propId`);--> statement-breakpoint
ALTER TABLE `notes` ADD `_tag` text DEFAULT 'note' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `prop_type` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `prop_default` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `prop_targets` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `owned_type` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `owned_parent` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `rule_storage` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `rule_targets` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `attrs_valid` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `notes_tag_idx` ON `notes` (`_tag`);--> statement-breakpoint
CREATE INDEX `notes_owned_parent_idx` ON `notes` (`owned_parent`);