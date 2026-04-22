import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: path.resolve(__dirname, "../../assets"),
  server: {
    host: "0.0.0.0",
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, "../..")]
    }
  }
});
