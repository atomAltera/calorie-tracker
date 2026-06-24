import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // listen on all interfaces (handy for tunnels)
    // Leading dot = allow the domain and every subdomain (any *.ngrok-free.app URL).
    allowedHosts: [".ngrok-free.app"],
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
