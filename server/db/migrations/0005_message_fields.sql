CREATE TABLE `tenant_message_fields` (
	`tenant_id` varchar(36) NOT NULL,
	`field_key` varchar(128) NOT NULL,
	`label` varchar(255) NOT NULL,
	`type` enum('text','longText','number','currency','date','time','datetime','phone','email','boolean','select') NOT NULL,
	`format` json NOT NULL,
	`position` int NOT NULL,
	`show_in_list` boolean NOT NULL DEFAULT true,
	`show_in_detail` boolean NOT NULL DEFAULT true,
	`is_active` boolean NOT NULL DEFAULT true,
	`orphaned` boolean NOT NULL DEFAULT false,
	`show_if_orphaned` boolean NOT NULL DEFAULT false,
	`source_script_id` int,
	`source_script_version` int,
	`updated_by_user_id` varchar(36),
	`updated_at` datetime NOT NULL,
	CONSTRAINT `tenant_message_fields_tenant_id_field_key_pk` PRIMARY KEY(`tenant_id`,`field_key`),
	CONSTRAINT `tenant_message_fields_tenant_position_uq` UNIQUE(`tenant_id`,`position`)
);
--> statement-breakpoint
CREATE TABLE `tenant_message_settings` (
	`tenant_id` varchar(36) NOT NULL,
	`script_account_number` varchar(32),
	`script_id` int,
	`script_version` int,
	`known_field_keys` json,
	`revision` int NOT NULL DEFAULT 0,
	`updated_by_user_id` varchar(36),
	`updated_at` datetime NOT NULL,
	CONSTRAINT `tenant_message_settings_tenant_id` PRIMARY KEY(`tenant_id`)
);
--> statement-breakpoint
ALTER TABLE `tenant_message_fields` ADD CONSTRAINT `tenant_message_fields_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_message_fields` ADD CONSTRAINT `tenant_message_fields_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_message_settings` ADD CONSTRAINT `tenant_message_settings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_message_settings` ADD CONSTRAINT `tenant_message_settings_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_message_settings` ADD CONSTRAINT `tenant_message_settings_script_account_fk` FOREIGN KEY (`script_account_number`) REFERENCES `tenant_recording_accounts`(`account_number`) ON DELETE set null ON UPDATE no action;