import { Post } from "../../api/Posts";
import { arePostsHidden } from "../../db/functions/HiddenPosts";
import { FilterFunction } from "../useRedditDataState";

export const filterHiddenItems: FilterFunction<Post> = (posts) => {
  const hiddenPosts = arePostsHidden(posts);
  return posts.filter((_post, index) => !hiddenPosts[index]);
};
