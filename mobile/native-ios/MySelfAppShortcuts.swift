import AppIntents

@available(iOS 16.0, *)
struct MySelfAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogApplePayExpenseIntent(),
      phrases: [
        "רשום הוצאה ב-\(.applicationName)",
        "Log expense in \(.applicationName)",
      ],
      shortTitle: "רשום הוצאה",
      systemImageName: "creditcard.fill"
    )
  }
}
