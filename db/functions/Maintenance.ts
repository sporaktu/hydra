import { maintainDrafts } from "./Drafts";
import { maintainHiddenPosts } from "./HiddenPosts";
import { maintainSeenPosts } from "./SeenPosts";

export async function doDBMaintenance() {
  await maintainSeenPosts();
  await maintainHiddenPosts();
  await maintainDrafts();
}
