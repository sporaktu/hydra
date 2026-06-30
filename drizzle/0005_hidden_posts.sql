CREATE TABLE `hidden_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postId` text NOT NULL,
	`title` text NOT NULL,
	`subreddit` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updatedAt` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hidden_posts_postId_idx` ON `hidden_posts` (`postId`);--> statement-breakpoint
CREATE INDEX `hidden_posts_expiresAt_idx` ON `hidden_posts` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `hidden_posts_createdAt_idx` ON `hidden_posts` (`createdAt`);--> statement-breakpoint
CREATE INDEX `hidden_posts_updatedAt_idx` ON `hidden_posts` (`updatedAt`);