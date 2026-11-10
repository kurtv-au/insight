CREATE TABLE `audit_events` (
	`id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`actor_user_id` varchar(36),
	`actor_email` varchar(255) NOT NULL,
	`action` varchar(64) NOT NULL,
	`tenant_id` varchar(36),
	`tenant_name` varchar(255),
	`target_label` varchar(255),
	`details` json,
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_tenant_id_created_at_idx` ON `audit_events` (`tenant_id`,`created_at`);