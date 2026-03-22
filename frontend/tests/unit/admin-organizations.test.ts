/**
 * Unit tests for AdminOrganizations (admin-organizations.js)
 *
 * Tests organization management: listing, creating, editing, deleting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminOrganizations } from '../../src/admin/admin-organizations.js';

function mockT(key: string, ...args: any[]) {
  if (args.length > 0) return `${key}:${args.join(',')}`;
  return key;
}

const mockOrgs = [
  { id: 'org1', name: 'Acme Corp', memberCount: 5 },
  { id: 'org2', name: 'Widgets Inc', memberCount: 12 },
];

function setupFetch(orgs = mockOrgs) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr === '/api/organizations' && (!opts || opts.method === undefined || opts.method === 'GET')) {
      return new Response(JSON.stringify(orgs), { status: 200 });
    }
    if (urlStr === '/api/organizations' && opts?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'org-new', name: 'New Org' }), { status: 200 });
    }
    if (urlStr.match(/\/api\/organizations\/.+/) && opts?.method === 'PUT') {
      return new Response('{}', { status: 200 });
    }
    if (urlStr.match(/\/api\/organizations\/.+/) && opts?.method === 'DELETE') {
      return new Response('{}', { status: 200 });
    }
    return new Response(JSON.stringify(orgs), { status: 200 });
  });
}

function createAdminOrgs(overrides: Record<string, any> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const showToast = vi.fn();
  return {
    instance: new AdminOrganizations({
      container,
      t: mockT,
      showToast,
      ...overrides,
    }),
    container,
    showToast,
  };
}

describe('AdminOrganizations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    setupFetch();
  });

  it('renders add org button', async () => {
    const { instance, container } = createAdminOrgs();
    await instance.render();

    const addBtn = container.querySelector('#apAddOrgBtn');
    expect(addBtn).not.toBeNull();
  });

  it('loads and displays organization cards', async () => {
    const { instance, container } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 2);

    expect(container.innerHTML).toContain('Acme Corp');
    expect(container.innerHTML).toContain('Widgets Inc');
  });

  it('displays member count', async () => {
    const { instance, container } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 2);
    // Member count shown via t('adminPanel.orgs.memberCount', count)
    expect(container.innerHTML).toContain('adminPanel.orgs.memberCount:5');
  });

  it('shows empty message when no orgs', async () => {
    setupFetch([]);
    const { instance, container } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.ap-empty') !== null);
    expect(container.querySelector('.ap-empty')).not.toBeNull();
  });

  it('shows create form when add button clicked', async () => {
    const { instance, container } = createAdminOrgs();
    await instance.render();

    const addBtn = container.querySelector('#apAddOrgBtn') as HTMLElement;
    addBtn.click();

    const formWrap = container.querySelector('#apOrgFormWrap') as HTMLElement;
    expect(formWrap.style.display).not.toBe('none');
    expect(container.querySelector('#apOrgNameInput')).not.toBeNull();
  });

  it('hides form on cancel', async () => {
    const { instance, container } = createAdminOrgs();
    await instance.render();

    const addBtn = container.querySelector('#apAddOrgBtn') as HTMLElement;
    addBtn.click();

    const cancelBtn = container.querySelector('#apOrgCancelBtn') as HTMLElement;
    cancelBtn.click();

    const formWrap = container.querySelector('#apOrgFormWrap') as HTMLElement;
    expect(formWrap.style.display).toBe('none');
  });

  it('does not save when name is empty', async () => {
    const { instance, container, showToast } = createAdminOrgs();
    await instance.render();

    const addBtn = container.querySelector('#apAddOrgBtn') as HTMLElement;
    addBtn.click();

    const saveBtn = container.querySelector('#apOrgSaveBtn') as HTMLElement;
    saveBtn.click();

    // Should not have called fetch with POST
    const postCalls = (fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'POST'
    );
    expect(postCalls.length).toBe(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('saves new org on save button click', async () => {
    const { instance, container, showToast } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 2);

    const addBtn = container.querySelector('#apAddOrgBtn') as HTMLElement;
    addBtn.click();

    const nameInput = container.querySelector('#apOrgNameInput') as HTMLInputElement;
    nameInput.value = 'New Organization';

    const saveBtn = container.querySelector('#apOrgSaveBtn') as HTMLElement;
    saveBtn.click();

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.orgs.saved');

    // Verify POST was called
    const postCall = (fetch as any).mock.calls.find(
      (c: any[]) => c[1]?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse(postCall[1].body)).toEqual({ name: 'New Organization' });
  });

  it('saves on Enter key in name input', async () => {
    const { instance, container, showToast } = createAdminOrgs();
    await instance.render();

    const addBtn = container.querySelector('#apAddOrgBtn') as HTMLElement;
    addBtn.click();

    const nameInput = container.querySelector('#apOrgNameInput') as HTMLInputElement;
    nameInput.value = 'Enter Org';
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.orgs.saved');
  });

  it('shows edit form with existing org name', async () => {
    const { instance, container } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 2);

    const editBtn = container.querySelector('[data-edit-org="org1"]') as HTMLElement;
    editBtn.click();

    const nameInput = container.querySelector('#apOrgNameInput') as HTMLInputElement;
    expect(nameInput.value).toBe('Acme Corp');
  });

  it('updates org on save in edit mode', async () => {
    const { instance, container, showToast } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 2);

    const editBtn = container.querySelector('[data-edit-org="org1"]') as HTMLElement;
    editBtn.click();

    const nameInput = container.querySelector('#apOrgNameInput') as HTMLInputElement;
    nameInput.value = 'Acme Updated';

    const saveBtn = container.querySelector('#apOrgSaveBtn') as HTMLElement;
    saveBtn.click();

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.orgs.saved');

    const putCall = (fetch as any).mock.calls.find(
      (c: any[]) => c[0]?.includes?.('/api/organizations/org1') && c[1]?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
  });

  it('deletes org on confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { instance, container, showToast } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 2);

    const deleteBtn = container.querySelector('[data-delete-org="org1"]') as HTMLElement;
    deleteBtn.click();

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.orgs.deleted');

    const deleteCall = (fetch as any).mock.calls.find(
      (c: any[]) => c[0]?.includes?.('/api/organizations/org1') && c[1]?.method === 'DELETE'
    );
    expect(deleteCall).toBeDefined();
  });

  it('does not delete org when confirm cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { instance, container, showToast } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 2);

    const deleteBtn = container.querySelector('[data-delete-org="org1"]') as HTMLElement;
    deleteBtn.click();

    const deleteCalls = (fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'DELETE'
    );
    expect(deleteCalls.length).toBe(0);
  });

  it('shows error toast on save failure', async () => {
    (fetch as any).mockImplementation(async (url: any, opts: any) => {
      if (opts?.method === 'POST') return new Response('error', { status: 500 });
      return new Response(JSON.stringify(mockOrgs), { status: 200 });
    });

    const { instance, container, showToast } = createAdminOrgs();
    await instance.render();

    const addBtn = container.querySelector('#apAddOrgBtn') as HTMLElement;
    addBtn.click();

    const nameInput = container.querySelector('#apOrgNameInput') as HTMLInputElement;
    nameInput.value = 'Fail Org';

    const saveBtn = container.querySelector('#apOrgSaveBtn') as HTMLElement;
    saveBtn.click();

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.orgs.saveError');
  });

  it('renders edit and delete buttons per org', async () => {
    const { instance, container } = createAdminOrgs();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.ap-card').length === 2);

    expect(container.querySelectorAll('[data-edit-org]').length).toBe(2);
    expect(container.querySelectorAll('[data-delete-org]').length).toBe(2);
  });
});
