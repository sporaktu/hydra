import { desc, eq, gt, inArray, lt } from "drizzle-orm";

import db from "..";
import { Post } from "../../api/Posts";
import { HiddenPosts } from "../schema";

/**
 * How long a locally hidden post stays hidden before it expires and starts
 * showing in feeds again. Hiding is purely local and never touches Reddit's
 * official "hide" endpoint.
 */
export const HIDDEN_POST_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Removes hidden posts that have passed their expiry date. Run on startup as
 * part of regular DB maintenance so the table doesn't grow without bound.
 */
export async function maintainHiddenPosts() {
  await db
    .delete(HiddenPosts)
    .where(lt(HiddenPosts.expiresAt, Date.now()))
    .execute();
}

export async function hidePost(post: Post) {
  const expiresAt = Date.now() + HIDDEN_POST_EXPIRY_MS;
  await db
    .insert(HiddenPosts)
    .values({
      postId: post.id,
      title: post.title,
      subreddit: post.subreddit,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: HiddenPosts.postId,
      set: {
        title: post.title,
        subreddit: post.subreddit,
        expiresAt,
      },
    })
    .execute();
}

export async function unhidePost(postId: string) {
  await db.delete(HiddenPosts).where(eq(HiddenPosts.postId, postId)).execute();
}

export function isPostHidden(post: Post) {
  const result = db
    .select()
    .from(HiddenPosts)
    .where(eq(HiddenPosts.postId, post.id))
    .limit(1)
    .get();
  return !!result && result.expiresAt > Date.now();
}

export function arePostsHidden(posts: Post[]) {
  const now = Date.now();
  const hiddenPosts = db
    .select()
    .from(HiddenPosts)
    .where(
      inArray(
        HiddenPosts.postId,
        posts.map((post) => post.id),
      ),
    )
    .all();

  return posts.map((post) =>
    hiddenPosts.some(
      (hiddenPost) =>
        hiddenPost.postId === post.id && hiddenPost.expiresAt > now,
    ),
  );
}

/**
 * Returns all non-expired hidden posts, most recently hidden first. Used by the
 * management screen so the user can review and unhide them.
 */
export function getHiddenPosts() {
  return db
    .select()
    .from(HiddenPosts)
    .where(gt(HiddenPosts.expiresAt, Date.now()))
    .orderBy(desc(HiddenPosts.createdAt))
    .all();
}
