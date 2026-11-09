CREATE TABLE `membership_message_filters` (
	`tenant_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`filter_id` varchar(36) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `membership_message_filters_tenant_id_user_id_filter_id_pk` PRIMARY KEY(`tenant_id`,`user_id`,`filter_id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_message_filters` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`field_key` varchar(128) NOT NULL,
	`value` varchar(255) NOT NULL,
	`updated_by_user_id` varchar(36),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `tenant_message_filters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `membership_message_filters` ADD CONSTRAINT `membership_message_filters_filter_fk` FOREIGN KEY (`filter_id`) REFERENCES `tenant_message_filters`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_message_filters` ADD CONSTRAINT `membership_message_filters_membership_fk` FOREIGN KEY (`tenant_id`,`user_id`) REFERENCES `memberships`(`tenant_id`,`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_message_filters` ADD CONSTRAINT `tenant_message_filters_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_message_filters` ADD CONSTRAINT `tenant_message_filters_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `membership_message_filters_filter_id_idx` ON `membership_message_filters` (`filter_id`);--> statement-breakpoint
CREATE INDEX `tenant_message_filters_tenant_id_idx` ON `tenant_message_filters` (`tenant_id`);