CREATE TABLE `email_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`purpose` enum('login','password_reset') NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`code_hash` varchar(64),
	`attempts` int NOT NULL DEFAULT 0,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`created_at` datetime NOT NULL,
	CONSTRAINT `email_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` enum('owner','admin','viewer') NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`invited_by_user_id` varchar(36),
	`expires_at` datetime NOT NULL,
	`accepted_at` datetime,
	`revoked_at` datetime,
	`created_at` datetime NOT NULL,
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`tenant_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role` enum('owner','admin','viewer') NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `memberships_tenant_id_user_id_pk` PRIMARY KEY(`tenant_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` varchar(255) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'Passkey',
	`public_key` text NOT NULL,
	`counter` int NOT NULL DEFAULT 0,
	`backed_up` boolean NOT NULL DEFAULT false,
	`transports` json,
	`last_used_at` datetime,
	`created_at` datetime NOT NULL,
	CONSTRAINT `passkeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT '',
	`password_hash` varchar(255),
	`email_verified_at` datetime,
	`is_platform_admin` boolean NOT NULL DEFAULT false,
	`disabled_at` datetime,
	`session_version` int NOT NULL DEFAULT 1,
	`last_login_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
	`attempt_id` varchar(64) NOT NULL,
	`challenge` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `webauthn_challenges_attempt_id` PRIMARY KEY(`attempt_id`)
);
--> statement-breakpoint
ALTER TABLE `email_tokens` ADD CONSTRAINT `email_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_invited_by_user_id_users_id_fk` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `passkeys` ADD CONSTRAINT `passkeys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `email_tokens_user_id_idx` ON `email_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `invitations_tenant_id_idx` ON `invitations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `invitations_email_idx` ON `invitations` (`email`);--> statement-breakpoint
CREATE INDEX `memberships_user_id_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkeys_user_id_idx` ON `passkeys` (`user_id`);