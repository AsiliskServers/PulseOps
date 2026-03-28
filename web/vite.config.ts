import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/pulseops/",
  server: {
    port: 5173,
    proxy: {
      "/pulseops/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
