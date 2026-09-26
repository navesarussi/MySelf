import {
  financePlanFixture,
  habitsFixture,
  homeFixture,
  tasksFixture,
  tradingDashboardFixture,
  tradingEquityFixture,
} from "@/lib/api-contracts/fixtures";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  AntDesign: "AntDesign",
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Link: "Link",
}));

jest.mock("../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "he",
  }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../theme", () => ({
  useColors: () => ({
    bg: "#000",
    surface: "#111",
    ink: "#fff",
    muted: "#888",
    accent: "#0af",
    danger: "#f00",
    success: "#0f0",
    border: "#333",
    chip: "#222",
  }),
  tokens: { space: { sm: 8, md: 16, lg: 24 }, radius: { md: 8 } },
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  ThemeCanvas: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../layout-dir", () => ({
  useLayoutDir: () => ({
    row: { flexDirection: "row" as const },
    textStart: { textAlign: "left" as const },
    textLtr: { writingDirection: "ltr" as const },
    writingDirection: "rtl" as const,
  }),
}));

jest.mock("../toast", () => ({
  useToast: () => ({ show: jest.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../hooks", () => ({
  useMinuteNow: () => new Date("2026-09-26T12:00:00.000Z"),
  useTodayDate: () => new Date("2026-09-26T12:00:00.000Z"),
  todayLocalISO: () => "2026-09-26",
}));

jest.mock("../hooks/use-habit-actions", () => ({
  useHabitActions: () => ({
    handleCheckIn: jest.fn(),
    handleReportFall: jest.fn(),
    handleReset: jest.fn(),
    handleBackfill: jest.fn(),
    handleSave: jest.fn(),
    handleDelete: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("../hooks/use-finance-section-collapse", () => ({
  useFinanceSectionCollapse: () => ({
    isCollapsed: () => false,
    toggle: jest.fn(),
    ready: true,
  }),
}));

const okQuery = (data: unknown) => ({
  data,
  loading: false,
  isFetching: false,
  error: null,
  refresh: jest.fn(),
});

jest.mock("../query", () => {
  const fixtures = jest.requireActual("@/lib/api-contracts/fixtures");
  const keys = jest.requireActual("../query/keys").queryKeys;
  return {
    queryKeys: keys,
    queryClient: {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
      getQueryData: jest.fn(),
    },
    useApiQuery: (key: unknown) => {
      const k = JSON.stringify(key);
      if (k.includes("home")) return okQuery(fixtures.homeFixture);
      if (k.includes("habits")) return okQuery(fixtures.habitsFixture);
      if (k.includes("tasks")) return okQuery(fixtures.tasksFixture);
      if (k.includes("projects")) return okQuery([{ id: "p1", name: "Inbox", sort_order: 0, created_at: "" }]);
      if (k.includes("financePlan")) return okQuery(fixtures.financePlanFixture);
      if (k.includes("financeTransactions")) return okQuery([]);
      if (k.includes("financeUncategorized")) return okQuery({ items: [], count: 0 });
      if (k.includes("financeFixedExpenses")) return okQuery([]);
      if (k.includes("financeRecurringSuggestions")) return okQuery([]);
      if (k.includes("financeSourcesStatus")) return okQuery({ sources: [] });
      if (k.includes("trading") && k.includes("dashboard")) return okQuery(fixtures.tradingDashboardFixture);
      if (k.includes("triggersFeed")) return okQuery([]);
      if (k.includes("eventsFeed")) return okQuery([]);
      return okQuery(null);
    },
    useApiMutation: () => ({
      run: jest.fn(),
      isPending: () => false,
      busy: () => false,
    }),
    useTradingEquity: () => ({
      data: fixtures.tradingEquityFixture,
      refresh: jest.fn(),
      isFetching: false,
    }),
    patchTaskInHome: jest.fn(),
    patchRelationshipInHome: jest.fn(),
    patchItemInList: jest.fn(),
    removeItemFromList: jest.fn(),
    removeTaskFromHome: jest.fn(),
  };
});

jest.mock("../components/error-boundary", () => ({
  ScreenErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  WidgetErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
