import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "client", "dist");
const indexPath = join(distDir, "index.html");
const fallbackPath = join(distDir, "404.html");

if (!existsSync(indexPath)) {
  throw new Error("client/dist/index.html does not exist. Run npm run build first.");
}

// GitHub Pages serves 404.html for deep links, so copy the SPA shell there.
copyFileSync(indexPath, fallbackPath);
