/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/jest-setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/../$1",
  },
  modulePaths: ["<rootDir>/node_modules"],
  testMatch: ["<rootDir>/src/__tests__/**/*.render.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|@tanstack/.*)",
  ],
};
