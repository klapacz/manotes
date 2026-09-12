---
name: jj-workspace
description: Create a Jujutsu workspace for parallel development. Use when a user asks for /workspace or wants to set up a new jj workspace.
---

# JJ Workspace

## Overview

Create a new Jujutsu workspace with `jj workspace add`. This creates an isolated working copy under `.workspace/<name>`. After creating it, install dependencies with `vp install`.

## Workflow

1. Get the workspace name from the user.
   - Must be a short, descriptive kebab-case identifier (e.g. `fix-auth`, `feature-billing`).
2. Create the workspace.
   - ```sh
     mkdir -p .workspace/$workspace_name
     jj workspace add .workspace/$workspace_name --name $workspace_name
     cp apps/worker/.env.local apps/worker/.env.prod ".workspace/$workspace_name/apps/worker/"
     (
       cd .workspace/$workspace_name
       direnv allow
       scripts/nix-develop -c vp install
     )
     ```
