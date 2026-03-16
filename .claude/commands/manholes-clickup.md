# Manholes ClickUp — Agent Skill

You manage **ClickUp tasks and subtasks** for the manholes-mapper project. Use this skill when adding new features, fixing bugs, or updating task statuses in ClickUp.

---

## ClickUp MCP Server

**All ClickUp operations MUST use the `clickup` MCP server tools.** The MCP server is configured in `.mcp.json` and provides direct API access.

### Available MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__clickup__get_workspaces` | List all workspaces |
| `mcp__clickup__get_spaces` | List spaces in a workspace |
| `mcp__clickup__get_lists` | List all lists in a space/folder |
| `mcp__clickup__get_tasks` | Get tasks from a list (use List ID `901815260471`) |
| `mcp__clickup__create_task` | Create a new task in a list |
| `mcp__clickup__update_task` | Update task status, description, assignees, etc. |
| `mcp__clickup__create_list` | Create a new list |
| `mcp__clickup__create_folder` | Create a new folder |
| `mcp__clickup__get_docs_from_workspace` | Get docs from workspace |

### How to Use

1. **Search/list tasks**: `mcp__clickup__get_tasks` with list ID `901815260471`
2. **Create a task**: `mcp__clickup__create_task` with list ID `901815260471`
3. **Update a task**: `mcp__clickup__update_task` with the task ID
4. **Fallback**: If MCP tools are unavailable, refer to `v3_tasks.csv` for task IDs and use `scripts/update_clickup.mjs` with `CLICKUP_API_TOKEN` env var.

---

## Quick Reference

| Item | Value |
|------|-------|
| Project List URL | [Version 3 Development](https://app.clickup.com/90182222916/v/li/901815260471) |
| List ID | `901815260471` |
| MCP Server | `clickup` (configured in `.mcp.json`, requires `CLICKUP_API_TOKEN` env var) |
| Existing Tasks | See `v3_tasks.csv` in project root for task IDs and relationships |

---

## Workflow

### 1. Identify the Change Type

Before interacting with ClickUp, categorize the current work:
- **FEATURE**: A wholly new functionality.
- **BUG**: A fix for an existing issue.
- **UPGRADE**: Enhancements to existing layouts or logic.

### 2. Search Before Creating

Always check if a task or subtask already exists to avoid duplicates:
- Use `mcp__clickup__get_tasks` with List ID `901815260471` to fetch current tasks.
- Search by name or description keywords.
- Refer to `v3_tasks.csv` for context on existing task IDs.

### 3. Task Creation & Naming

If no matching task is found, create one using `mcp__clickup__create_task`:
- **Prefix**: Use `FEATURE:`, `BUG:`, or `UPGRADE:`.
- **Title**: Be concise but descriptive (e.g., `FEATURE: add user authentication`).
- **Subtasks**: Use subtasks for granular changes that belong to a larger feature.

### 4. Updating Tasks

Use `mcp__clickup__update_task` with the task ID:
- **Status**: Update the task status as you progress (e.g., `in progress`, `success in dev`).
- **Description**: Add technical details or PR links if relevant.
- **Assignees**: Assign tasks to the relevant developer if known (e.g., `hussam.k47@gmail.com`).

---

## Phases

1. **Discovery** — Determine the scope of your changes. Check for an existing ClickUp task in List `901815260471`.
2. **Action** — If task exists: update its status to `in progress`. If task doesn't exist: create a new task/subtask.
3. **Completion** — Once code changes are made and verified, update the task status to `success in dev`.

---

## Statuses

| Status | Meaning |
|--------|---------|
| `backlog` | Planned but not started |
| `in progress` | Active development |
| `success in dev` | Completed and pushed to dev branch |
| `Testing` | Ready for QA |
| `Closed` | Verified and merged |

## Priority Levels

| Priority | Use For |
|----------|---------|
| `urgent` | Critical bugs or blocking features |
| `high` | Important features for the current sprint |
| `normal` | Standard tasks |
| `low` | Minor enhancements or non-urgent refactoring |

## Task Metadata

- **Tags**: Used for versioning (e.g., `v3.0`, `v3.1`).
- **Custom Fields**:
  - `Development Stage`: e.g., `Development`, `Testing`, `Planning`
  - `Version Number`: e.g., `V3.0`
  - `Assigned Developer`: Email or name of the developer
