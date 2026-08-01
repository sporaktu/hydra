// Mock native modules pulled in transitively via Posts → RedditApi → RedditCookies
jest.mock("@preeternal/react-native-cookie-manager", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), clearAll: jest.fn() },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// ...and via User → PostDetail → Stats, which opens the SQLite database on import
jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({ execSync: jest.fn() }),
  SQLiteStatement: class {
    executeSync() {
      return {};
    }
    finalizeSync() {}
  },
}));
jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: () => ({}),
}));

import { act, create } from "react-test-renderer";
import { Text } from "react-native";
import useRedditDataState from "../useRedditDataState";
import { RedditDataObject } from "../../api/RedditApi";
import { MultiredditUnavailableError } from "../../api/Multireddit";

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import * as Sentry from "@sentry/react-native";

type Item = RedditDataObject;

const item = (id: string): Item => ({ id, type: "post", after: id });

let last: ReturnType<typeof useRedditDataState<Item, "postLoadingError">>;

function Probe({ loadData }: { loadData: () => Promise<Item[]> }) {
  last = useRedditDataState<Item, "postLoadingError">({ loadData });
  return <Text>{String(last.data.length)}</Text>;
}

const render = async (loadData: () => Promise<Item[]>) => {
  await act(async () => {
    create(<Probe loadData={loadData} />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

it("loads data", async () => {
  await render(async () => [item("a")]);
  expect(last.data).toHaveLength(1);
  expect(last.loadFailed).toBe(false);
});

it("flags an unexpected failure instead of leaving the load unresolved", async () => {
  const error = new SyntaxError("Unexpected token < in JSON");
  await render(async () => {
    throw error;
  });

  expect(last.loadFailed).toBe(true);
  // fullyLoaded ends the loading state so the page can stop spinning
  expect(last.fullyLoaded).toBe(true);
  expect(last.data).toEqual([]);
  expect(Sentry.captureException).toHaveBeenCalledWith(error);
});

it("routes known access failures to accessFailure, not the generic failure", async () => {
  await render(async () => {
    throw new MultiredditUnavailableError();
  });

  expect(last.accessFailure).toBeInstanceOf(MultiredditUnavailableError);
  expect(last.loadFailed).toBe(false);
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

it("clears the failure flag when refreshing succeeds", async () => {
  let shouldFail = true;
  await render(async () => {
    if (shouldFail) throw new Error("nope");
    return [item("a")];
  });
  expect(last.loadFailed).toBe(true);

  shouldFail = false;
  await act(async () => {
    await last.refreshData();
  });

  expect(last.loadFailed).toBe(false);
  expect(last.data).toHaveLength(1);
});
