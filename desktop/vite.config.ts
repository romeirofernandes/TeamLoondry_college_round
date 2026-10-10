import { defineConfig } from "vite";
export default defineConfig({ clearScreen: false, build: { target: "es2022" }, server: { strictPort: true }, worker: { format: "iife" } });
