import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/VM-tippeside/",
  plugins: [react()],
  build: {
    outDir: "dist"
  }
});
