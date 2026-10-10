import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "world-register",
    compatibilityDate: "2026-10-01",
    observability: {
      enabled: true,
    },
  },
});
