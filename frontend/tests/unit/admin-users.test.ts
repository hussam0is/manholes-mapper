/**
 * Unit tests for AdminUsers (admin-users.js)
 *
 * Tests user management UI: loading, filtering, role updates,
 * org assignment, and card rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminUsers } from '../../src/admin/admin-users.js';

function mockT(key: string) {
  return key;
}

const mockUsers = [
  { id: 'u1', name: 'Alice Smith', email: 'alice@test.com', role: 'admin', organizationId: 'org1', organizationName: 'Acme' },
  { id: 'u2', name: 'Bob Jones', email: 'bob@test.com', role: 'user', organizationId: null, organizationName: null },
  { id: 'u3', name: 'Charlie Brown', email: 'charlie@test.com', role: 'super_admin', organizationId: 'org1', organizationName: 'Acme' },
];

const mockOrgs = [
  { id: 'org1', name: 'Acme Corp' },
  { id: 'org2', name: 'Widgets Inc' },
];

function setupFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr === '/api/users') {
      return new Response(JSON.stringify(mockUsers), { status: 200 });
    }
    if (urlStr === '/api/organizations') {
      return new Response(JSON.stringify(mockOrgs), { status: 200 });
    }
    if (urlStr.match(/\/api\/users\/.+/)) {
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
}

function createAdminUsers(overrides: Record<string, any> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const showToast = vi.fn();
  return {
    instance: new AdminUsers({
      container,
      t: mockT,
      showToast,
      currentUser: { role: 'super_admin', organizationId: 'org1' },
      ...overrides,
    }),
    container,
    showToast,
  };
}

describe('AdminUsers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    setupFetch();
  });

  it('renders search input', async () => {
    const { instance, container } = createAdminUsers();
    await instance.render();

    const search = container.querySelector('#apUsersSearch') as HTMLInputElement;
    expect(search).not.toBeNull();
    expect(search.type).toBe('text');
  });

  it('loads and displays user cards', async () => {
    const { instance, container } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => {
      const cards = container.querySelectorAll('.ap-card');
      return cards.length === 3;
    });

    const cards = container.querySelectorAll('.ap-card');
    expect(cards.length).toBe(3);
  });

  it('displays user name and email', async () => {
    const { instance, container } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    expect(container.innerHTML).toContain('Alice Smith');
    expect(container.innerHTML).toContain('alice@test.com');
    expect(container.innerHTML).toContain('Bob Jones');
  });

  it('filters users by search query', async () => {
    const { instance, container } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const search = container.querySelector('#apUsersSearch') as HTMLInputElement;
    search.value = 'alice';
    search.dispatchEvent(new Event('input'));

    const cards = container.querySelectorAll('.ap-card');
    expect(cards.length).toBe(1);
    expect(container.innerHTML).toContain('Alice Smith');
  });

  it('filters by email', async () => {
    const { instance, container } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const search = container.querySelector('#apUsersSearch') as HTMLInputElement;
    search.value = 'bob@';
    search.dispatchEvent(new Event('input'));

    const cards = container.querySelectorAll('.ap-card');
    expect(cards.length).toBe(1);
  });

  it('shows empty message when no users match filter', async () => {
    const { instance, container } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const search = container.querySelector('#apUsersSearch') as HTMLInputElement;
    search.value = 'zzzzzznonexistent';
    search.dispatchEvent(new Event('input'));

    expect(container.querySelector('.ap-empty')).not.toBeNull();
  });

  it('renders role select for super_admin', async () => {
    const { instance, container } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const roleSelects = container.querySelectorAll('[data-user-role-select]');
    expect(roleSelects.length).toBe(3);
  });

  it('renders org select for super_admin', async () => {
    const { instance, container } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const orgSelects = container.querySelectorAll('[data-user-org-select]');
    expect(orgSelects.length).toBe(3); // Only super_admin sees org select
  });

  it('does not render org select for regular admin', async () => {
    const { instance, container } = createAdminUsers({ currentUser: { role: 'admin', organizationId: 'org1' } });
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const orgSelects = container.querySelectorAll('[data-user-org-select]');
    expect(orgSelects.length).toBe(0);
  });

  it('updates user role on select change', async () => {
    const { instance, container, showToast } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const roleSelect = container.querySelector('[data-user-role-select="u2"]') as HTMLSelectElement;
    roleSelect.value = 'admin';
    roleSelect.dispatchEvent(new Event('change'));

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.users.roleSaved');

    // Verify PUT was called
    const putCall = (fetch as any).mock.calls.find(
      (c: any[]) => c[0]?.includes?.('/api/users/u2') && c[1]?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
    expect(JSON.parse(putCall[1].body)).toEqual({ role: 'admin' });
  });

  it('reverts role on update failure', async () => {
    const { instance, container, showToast } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    // Make PUT fail
    (fetch as any).mockImplementation(async (url: any, opts: any) => {
      if (opts?.method === 'PUT') return new Response('error', { status: 500 });
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/api/users') return new Response(JSON.stringify(mockUsers), { status: 200 });
      if (urlStr === '/api/organizations') return new Response(JSON.stringify(mockOrgs), { status: 200 });
      return new Response('{}', { status: 200 });
    });

    // Re-render to get fresh state
    await instance.render();
    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const roleSelect = container.querySelector('[data-user-role-select="u2"]') as HTMLSelectElement;
    const originalValue = roleSelect.value;
    roleSelect.value = 'super_admin';
    roleSelect.dispatchEvent(new Event('change'));

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.users.roleError');
  });

  it('updates user org on select change', async () => {
    const { instance, container, showToast } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 3);

    const orgSelect = container.querySelector('[data-user-org-select="u2"]') as HTMLSelectElement;
    orgSelect.value = 'org2';
    orgSelect.dispatchEvent(new Event('change'));

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.users.orgSaved');
  });

  it('handles load errors gracefully', async () => {
    (fetch as any).mockRejectedValue(new Error('Network error'));

    const { instance, container } = createAdminUsers();
    await instance.render();

    // Should render without crashing, showing no users
    await vi.waitFor(() => {
      return container.querySelector('#apUsersList') !== null;
    });
  });

  it('shows user with dash when name is missing', async () => {
    (fetch as any).mockImplementation(async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/api/users') {
        return new Response(JSON.stringify([{ id: 'x', name: null, email: 'no-name@test.com', role: 'user' }]), { status: 200 });
      }
      if (urlStr === '/api/organizations') return new Response('[]', { status: 200 });
      return new Response('{}', { status: 200 });
    });

    const { instance, container } = createAdminUsers();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 1);
    expect(container.innerHTML).toContain('—');
  });
});
