import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({ resolve:{alias:{"@mediapipe/tasks-vision":fileURLToPath(new URL("./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",import.meta.url))}}, clearScreen:false, build:{target:"es2022"},server:{strictPort:true},worker:{format:"iife"} });
