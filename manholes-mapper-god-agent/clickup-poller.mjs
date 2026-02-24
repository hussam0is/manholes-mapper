/**
 * ClickUp REST API poller.
 * Uses the v2 API directly (no MCP dependency).
 */

export class ClickUpPoller {
  constructor(token, listId) {
    this.token = token;
    this.listId = listId;
    this.baseUrl = 'https://api.clickup.com/api/v2';
  }

  async fetchTasks() {
    if (!this.token) throw new Error('CLICKUP_API_TOKEN not set');

    const url = `${this.baseUrl}/list/${this.listId}/task?include_closed=true&subtasks=true`;
    const res = await fetch(url, {
      headers: { Authorization: this.token },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ClickUp API ${res.status}: ${body}`);
    }

    const data = await res.json();
    return (data.tasks || []).map(t => ({
      id: t.id,
      name: t.name,
      status: t.status?.status || 'unknown',
      priority: t.priority?.priority || 'none',
      url: t.url,
      dateCreated: t.date_created,
      dateUpdated: t.date_updated,
      assignees: (t.assignees || []).map(a => a.email || a.username),
      parent: t.parent || null,
      description: (t.description || '').slice(0, 200),
    }));
  }

  async updateTaskStatus(taskId, status) {
    if (!this.token) throw new Error('CLICKUP_API_TOKEN not set');

    const url = `${this.baseUrl}/task/${taskId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ClickUp API ${res.status}: ${body}`);
    }

    return await res.json();
  }

  async getTask(taskId) {
    if (!this.token) throw new Error('CLICKUP_API_TOKEN not set');

    const url = `${this.baseUrl}/task/${taskId}`;
    const res = await fetch(url, {
      headers: { Authorization: this.token },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ClickUp API ${res.status}: ${body}`);
    }

    return await res.json();
  }
}
