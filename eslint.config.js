import globals from "globals";

// Flat config. The codebase predates any linter, so this starts as a ratchet:
// real errors (undefined globals, var) fail the build, style drifts only warn
// and CI does not pass --max-warnings, so warnings cannot block a merge until
// someone opts in deliberately.
export default [
  {
    files: ["src/**/*.js", "scripts/**/*.mjs"],
    ignores: ["lib/**", "node_modules/**", "assets/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-var": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "prefer-const": "warn",
      eqeqeq: ["warn", "always", { null: "ignore" }],
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
