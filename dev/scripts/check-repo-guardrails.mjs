#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function getTrackedFiles() {
  return execFileSync("git", ["ls-files"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  })
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function hasSegment(path, segment) {
  return path === segment || path.startsWith(`${segment}/`) || path.includes(`/${segment}/`);
}

function hasSuffixSegment(path, suffix) {
  return path === suffix || path.endsWith(`/${suffix}`);
}

const blockedRules = [
  {
    label: "local agent state",
    reason: "Do not commit Codex/Claude local worktrees, caches, or session state.",
    test: (path) => hasSegment(path, ".claude")
  },
  {
    label: "macOS metadata",
    reason: "Do not commit finder metadata files.",
    test: (path) => hasSuffixSegment(path, ".DS_Store")
  },
  {
    label: "local environment overrides",
    reason: "Do not commit machine-specific environment override files.",
    test: (path) =>
      hasSuffixSegment(path, ".env.local") ||
      /\.env\.[^.]+\.local$/.test(path)
  },
  {
    label: "Node dependency folders",
    reason: "Do not commit installed npm packages; keep package manifests and lockfiles instead.",
    test: (path) => hasSegment(path, "node_modules")
  },
  {
    label: "Dart and Flutter tool caches",
    reason: "Do not commit generated Dart/Flutter dependency metadata or local tool caches.",
    test: (path) =>
      hasSegment(path, ".dart_tool") ||
      hasSuffixSegment(path, ".packages") ||
      hasSuffixSegment(path, ".flutter-plugins") ||
      hasSuffixSegment(path, ".flutter-plugins-dependencies")
  },
  {
    label: "Flutter platform dependency outputs",
    reason: "Do not commit generated Flutter platform dependencies or ephemeral build outputs.",
    test: (path) =>
      path.includes("/android/.gradle/") ||
      path.includes("/android/app/build/") ||
      path.includes("/ios/Pods/") ||
      path.includes("/ios/Flutter/App.framework/") ||
      path.includes("/ios/Flutter/Flutter.framework/") ||
      path.includes("/ios/Flutter/Generated.xcconfig") ||
      path.includes("/linux/flutter/ephemeral/") ||
      path.includes("/macos/Flutter/ephemeral/") ||
      path.includes("/windows/flutter/ephemeral/")
  },
  {
    label: "Terraform local state and build artifacts",
    reason: "Do not commit Terraform state, local variable files, plans, or packaged deployment artifacts.",
    test: (path) =>
      hasSegment(path, ".terraform") ||
      hasSegment(path, ".terraform-build") ||
      hasSuffixSegment(path, "terraform.tfstate") ||
      path.includes("/terraform.tfstate.") ||
      (hasSuffixSegment(path, "terraform.tfvars") &&
        !hasSuffixSegment(path, "terraform.tfvars.example")) ||
      path.endsWith(".tfplan") ||
      path.endsWith(".tfplan.json")
  }
];

const trackedFiles = getTrackedFiles();
const violations = blockedRules
  .map((rule) => ({
    ...rule,
    matches: trackedFiles.filter(rule.test)
  }))
  .filter((rule) => rule.matches.length > 0);

if (violations.length > 0) {
  console.error("Repository guardrail check failed.");
  console.error("Remove these files from Git tracking and keep them ignored.\n");

  for (const violation of violations) {
    console.error(`- ${violation.label}: ${violation.reason}`);
    for (const file of violation.matches.slice(0, 40)) {
      console.error(`  ${file}`);
    }

    if (violation.matches.length > 40) {
      console.error(`  ...and ${violation.matches.length - 40} more`);
    }
    console.error("");
  }

  console.error("Typical fix: git rm -r --cached <path>, then commit the removal and .gitignore update.");
  process.exit(1);
}

console.log(`Repository guardrails passed for ${trackedFiles.length} tracked files.`);
