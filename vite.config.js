import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { agentSessionsDevApi } from "./vite-plugins/agentSessionsDevApi.mjs";

export default defineConfig({
  plugins: [react(), agentSessionsDevApi()],
  /** `vite preview` 时可将 /api 转发到独立服务（先运行 `node backend/serveAgentSessionsApi.mjs`） */
  preview: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
