---
name: manholes-clickup
description: Manage ClickUp tasks and subtasks for the manholes-mapper project. Use when adding new features, fixing bugs, or updating task statuses in ClickUp (List ID 901815260471).
---

# Manholes ClickUp Skill

## Overview

This skill enables automated management of ClickUp tasks for the `manholes-mapper` project. It uses ClickUp MCP tools to interact with the project's task list.

**Project List URL**: [https://app.clickup.com/90182222916/v/li/901815260471](https://app.clickup.com/90182222916/v/li/901815260471)
**List ID**: `901815260471`

## Instructions

### 1. Identify the Change Type
Before interacting with ClickUp, categorize your current work:
- **FEATURE**: A wholly new functionality.
- **BUG**: A fix for an existing issue.
- **UPGRADE**: Enhancements to existing layouts or logic.

### 2. Search Before Creating
Always check if a task or subtask already exists to avoid duplicates:
- Use `search_tasks` or `get_tasks` within the specified List ID.
- Search by name or description keywords.
- Refer to `v3_tasks.csv` for context on existing task IDs.

### 3. Task Creation & Naming
If no matching task is found, create one following these conventions:
- **Prefix**: Use `FEATURE:`, `BUG:`, or `UPGRADE:`.
- **Title**: Be concise but descriptive (e.g., `FEATURE: add user authentication`).
- **Subtasks**: Use subtasks for granular changes that belong to a larger feature.

### 4. Updating Tasks
- **Status**: Update the task status as you progress (e.g., `in progress`, `success in dev`).
- **Description**: Add technical details or PR links if relevant.
- **Assignees**: Assign tasks to the relevant developer if known (e.g., `hussam.k47@gmail.com`).

## Workflow

1.  **Phase: Discovery**
    - Determine the scope of your changes.
    - Check for an existing ClickUp task in List `901815260471`.

2.  **Phase: Action**
    - If task exists: Update its status to `in progress`.
    - If task doesn't exist: Create a new task/subtask.

3.  **Phase: Completion**
    - Once code changes are made and verified, update the task status to `success in dev`.

## Additional Resources

- For detailed list structure and priorities, see [reference.md](reference.md).
