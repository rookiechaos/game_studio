#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const IGNORE_DIRS = new Set([
  ".git",
  ".venv",
  "node_modules",
  ".next",
  "game_studio.egg-info",
  "__pycache__",
]);
const IGNORE_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const TEXT_EXTENSIONS = new Set([
  ".py",
  ".ts",
  ".tsx",
  ".md",
  ".html",
  ".json",
  ".mjs",
  ".js",
  ".sh",
  ".ps1",
  ".txt",
  ".example",
  ".css",
]);

const FORBIDDEN_SCRIPTS = [
  { name: "Korean", pattern: /[\u1100-\u11FF\uAC00-\uD7AF]/ },
  { name: "Cyrillic", pattern: /[\u0400-\u04FF]/ },
  { name: "Arabic", pattern: /[\u0600-\u06FF]/ },
  { name: "Thai", pattern: /[\u0E00-\u0E7F]/ },
  { name: "Devanagari", pattern: /[\u0900-\u097F]/ },
];

const FORBIDDEN_LANGUAGE_MARKERS = new RegExp(
  [
    "简体中文",
    "繁体中文",
    "中文界面",
    "汉语",
    "\uD55C\uAD6D\uC5B4",
    "русский",
    "fran\u00e7ais",
    "deutsch",
    "espa\u00f1ol",
  ].join("|"),
  "i"
);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (IGNORE_FILES.has(entry)) continue;
    if (entry === "check-languages.mjs") continue;
    const ext = entry.includes(".") ? `.${entry.split(".").pop()}` : "";
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    files.push(fullPath);
  }
  return files;
}

const violations = [];

for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  for (const rule of FORBIDDEN_SCRIPTS) {
    if (rule.pattern.test(text)) {
      violations.push({ file: relative(ROOT, file), rule: rule.name });
      break;
    }
  }
  if (FORBIDDEN_LANGUAGE_MARKERS.test(text)) {
    violations.push({ file: relative(ROOT, file), rule: "Non EN/JA language marker" });
  }
}

if (violations.length) {
  console.error("Unsupported language content detected. Only English and Japanese are allowed.\n");
  for (const item of violations) {
    console.error(`- ${item.file}: ${item.rule}`);
  }
  process.exit(1);
}

console.log("Language check passed: repository content is limited to English and Japanese.");
