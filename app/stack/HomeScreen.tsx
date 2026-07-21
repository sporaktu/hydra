import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { StackParamsList } from "./index";
import PostsPage from "../../pages/PostsPage";
import { getSwitcherSubredditName } from "../../utils/getSwitcherSubredditName";
import SwitcherHeaderTitle from "../../components/Navbar/SwitcherHeaderTitle";

type HomeScreenProps = {
  StackNavigator: ReturnType<
    typeof createNativeStackNavigator<StackParamsList>
  >;
};

export default function HomeScreen({ StackNavigator }: HomeScreenProps) {
  return (
    <StackNavigator.Screen<"Home">
      name="Home"
      component={PostsPage}
      options={({ route }) => {
        const switcherName = getSwitcherSubredditName(route.params.url);
        return {
          headerBackTitle: "Subreddits",
          freezeOnBlur: true,
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
