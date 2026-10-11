import js from "@eslint/js";
import globals from "globals";

// The page scripts are classic scripts that share top-level globals
// (see CLAUDE.md). Each script declares what it reads from the others.
const shared = {
  COUNTRIES: "readonly",
  US_STATES: "readonly",
  FACTS: "readonly",
  CULTURE: "readonly",
  ChaseEngine: "readonly",
  WORLD_MAP: "readonly",
  US_MAP: "readonly",
  d3: "readonly",
  topojson: "readonly",
};

export default [
  {
    ignores: ["site/vendor/", "site/map/", "site/culture.js", "site/facts.js", ".cloudflare/", ".wrangler/", ".omc/"],
  },
  js.configs.recommended,
  {
    files: ["site/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...shared },
    },
    rules: {
      // A top-level const in a classic script is a global for the next script.
      "no-unused-vars": ["error", { vars: "local", args: "after-used", caughtErrors: "none" }],
      // The file that defines a shared global also lists it above.
      "no-redeclare": ["error", { builtinGlobals: false }],
      // localStorage can throw (private mode); an empty catch ignores that.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["scripts/**/*.js", "*.config.js"],
    languageOptions: {
      sourceType: "module",
      globals: globals.node,
    },
  },
];
