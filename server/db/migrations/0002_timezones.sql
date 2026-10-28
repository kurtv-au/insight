ALTER TABLE `tenants` ADD `timezone` varchar(64) DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `timezone` varchar(64);