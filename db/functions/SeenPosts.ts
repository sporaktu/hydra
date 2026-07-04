import { eq, inArray, lt } from "drizzle-orm";

import db from "..";
import { Post } from "../../api/Posts";
import { SeenPosts } from "../schema";

export async function maintainSeenPosts() {
  const MAX_SEEN_POSTS = 5_000;
  const seenPostCount = await db.$count(SeenPosts);
  if (seenPostCount > MAX_SEEN_POSTS) {
    const oldestSeenPost = db
      .select()
      .from(SeenPosts)
      .orderBy(SeenPosts.createdAt)
      .offset(seenPostCount - MAX_SEEN_POSTS)
      .limit(1)
      .get();
    if (oldestSeenPost) {
      await db
        .delete(SeenPosts)
        .where(lt(SeenPosts.id, oldestSeenPost.id))
        .execute();
    }
  }
}

/**
 * Components displaying a post's seen state subscribe here so that marking a
 * post seen/unseen re-renders only the affected post, rather than forcing a
 * whole-list re-render (e.g. via a FlashList extraData bump).
 */
type SeenChangeListener = (seen: boolean) => void;
const seenChangeListeners = new Map<string, Set<SeenChangeListener>>();

export function subscribeToSeenChange(
  postId: string,
  listener: SeenChangeListener,
) {
  let listeners = seenChangeListeners.get(postId);
  if (!listeners) {
    listeners = new Set();
    seenChangeListeners.set(postId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      seenChangeListeners.delete(postId);
    }
  };
}

function emitSeenChange(postId: string, seen: boolean) {
  seenChangeListeners.get(postId)?.forEach((listener) => listener(seen));
}

export async function markPostSeen(post: Post) {
  await db
    .insert(SeenPosts)
    .values({
      postId: post.id,
    })
    .onConflictDoNothing()
    .execute();
  emitSeenChange(post.id, true);
}

export async function markPostUnseen(post: Post) {
  await db.delete(SeenPosts).where(eq(SeenPosts.postId, post.id)).execute();
  emitSeenChange(post.id, false);
}

export function isPostSeen(post: Post) {
  const result = db
    .select()
    .from(SeenPosts)
    .where(eq(SeenPosts.postId, post.id))
    .limit(1)
    .get();
  return !!result;
}

export function arePostsSeen(posts: Post[]) {
  const seenPosts = db
    .select()
    .from(SeenPosts)
    .where(
      inArray(
        SeenPosts.postId,
        posts.map((post) => post.id),
      ),
    )
    .all();

  return posts.map((post) =>
    seenPosts.some((seenPost) => seenPost.postId === post.id),
  );
}
