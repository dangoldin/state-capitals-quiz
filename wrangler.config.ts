import { defineWranglerConfig } from "wrangler/experimental-config";

// cf builds static sites with Wrangler. Only site/ is published.
export default defineWranglerConfig({
  assetsDirectory: "./site",
});
