import { defineConfig } from "vitest/config";
export default defineConfig({ test: { exclude:["ui-tests/**","node_modules/**","dist/**","test-results/**"] } });
