CREATE TABLE `game_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_peer_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `room_players` (
	`peer_id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`name` text NOT NULL,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_room_players_room_code` ON `room_players` (`room_code`);--> statement-breakpoint
CREATE TABLE `room_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`target_peer_id` text NOT NULL,
	`sender_peer_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_room_signals_target_after` ON `room_signals` (`room_code`,`target_peer_id`,`id`);