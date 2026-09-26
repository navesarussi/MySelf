import React from "react";
import { render } from "@testing-library/react-native";
import HomeScreen from "../../app/(tabs)/index";
import FinanceScreen from "../../app/(tabs)/finance";
import HabitsScreen from "../../app/(tabs)/habits";
import TasksScreen from "../../app/(tabs)/tasks";
import TradingScreen from "../../app/(tabs)/trading";

describe("main tab screens render", () => {
  it("Home", () => {
    expect(() => render(<HomeScreen />)).not.toThrow();
  });

  it("Money (Finance)", () => {
    expect(() => render(<FinanceScreen />)).not.toThrow();
  });

  it("Habits", () => {
    expect(() => render(<HabitsScreen />)).not.toThrow();
  });

  it("Tasks", () => {
    expect(() => render(<TasksScreen />)).not.toThrow();
  });

  it("Trading", () => {
    expect(() => render(<TradingScreen />)).not.toThrow();
  });
});
