#!/usr/bin/env node

import { execSync } from "node:child_process";

const allowLocalPublish = process.env.ALLOW_LOCAL_PUBLISH === "1";
const isGitHubActions = process.env.GITHUB_ACTIONS === "true";

if (!isGitHubActions && !allowLocalPublish) {
  console.error("Local npm publish is disabled. Use the GitHub Actions release workflow instead.");
  console.error(
    "If you intentionally need a one-off local publish, rerun with ALLOW_LOCAL_PUBLISH=1.",
  );
  process.exit(1);
}

execSync("npm run build", { stdio: "inherit" });
