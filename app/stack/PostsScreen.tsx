import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { StackParamsList } from "./index";
import PostsPage from "../../pages/PostsPage";
import RedditURL from "../../utils/RedditURL";
import { getSwitcherSubredditName } from "../../utils/getSwitcherSubredditName";
import SwitcherHeaderTitle from "../../components/Navbar/SwitcherHeaderTitle";

type PostsScreenProps = {
  StackNavigator: ReturnType<
    typeof createNativeStackNavigator<StackParamsList>
  >;
};

export default function PostsScreen({ StackNavigator }: PostsScreenProps) {
  return (
    <StackNavigator.Screen<"PostsPage">
      name="PostsPage"
      component={PostsPage}
      options={({ route }) => {
        const switcherName = getSwitcherSubredditName(route.params.url);
        return {
          title: new RedditURL(route.params.url).getPageName(),
          ...(switcherName
            ? {
                headerTitle: () => <SwitcherHeaderTitle title={switcherName} />,
              }
            : {}),
        };
      }}
    />
  );
}
