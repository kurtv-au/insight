CREATE TABLE `tenant_recording_accounts` (
	`account_number` varchar(32) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `tenant_recording_accounts_account_number` PRIMARY KEY(`account_number`)
);
--> statement-breakpoint
CREATE TABLE `user_tenant_preferences` (
	`user_id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`recording_columns` json,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `user_tenant_preferences_user_id_tenant_id_pk` PRIMARY KEY(`user_id`,`tenant_id`)
);
--> statement-breakpoint
ALTER TABLE `tenants` ADD `recording_columns` json;--> statement-breakpoint
ALTER TABLE `tenants` ADD `recording_default_columns` json;--> statement-breakpoint
ALTER TABLE `tenant_recording_accounts` ADD CONSTRAINT `tenant_recording_accounts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_tenant_preferences` ADD CONSTRAINT `user_tenant_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_tenant_preferences` ADD CONSTRAINT `user_tenant_preferences_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tenant_recording_accounts_tenant_id_idx` ON `tenant_recording_accounts` (`tenant_id`);