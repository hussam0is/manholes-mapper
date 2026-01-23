/**
 * Projects Settings Module
 * 
 * This module provides a ProjectsSettings class for managing projects
 * with full CRUD functionality following the vision document design.
 */

/**
 * ProjectsSettings - Projects management UI component
 */
export class ProjectsSettings {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Function} options.t - Translation function
   * @param {Function} options.showToast - Toast notification function
   */
  constructor({ container, t, showToast }) {
    this.container = container;
    this.t = t;
    this.showToast = showToast;
    this.projects = [];
    this.isLoading = false;
    this.isAdmin = false;
  }

  /**
   * Render the projects management UI
   */
  async render() {
    this.container.innerHTML = '';
    this.container.classList.add('admin-modern-content', 'projects-content');

    // Show loading state
    this._showLoading();

    try {
      // Fetch projects from API
      await this._fetchProjects();
      
      // Render the project list
      this._renderContent();
    } catch (error) {
      console.error('[ProjectsSettings] Error loading projects:', error);
      this._showError('Failed to load projects');
    }
  }

  /**
   * Show loading spinner
   */
  _showLoading() {
    this.container.innerHTML = `
      <div class="projects-loading">
        <span class="material-icons spin">sync</span>
        <span>Loading...</span>
      </div>
    `;
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  _showError(message) {
    this.container.innerHTML = `
      <div class="projects-error">
        <span class="material-icons">error_outline</span>
        <span>${message}</span>
      </div>
    `;
  }

  /**
   * Fetch projects from the API
   */
  async _fetchProjects() {
    try {
      const token = await window.Clerk?.session?.getToken();
      if (!token) {
        console.warn('[ProjectsSettings] No auth token available');
        this.projects = [];
        return;
      }

      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }

      const data = await response.json();
      this.projects = data.projects || [];

      // Check if current user is admin
      await this._checkAdminStatus();
    } catch (error) {
      console.error('[ProjectsSettings] Error fetching projects:', error);
      this.projects = [];
      throw error;
    }
  }

  /**
   * Check if current user is admin
   */
  async _checkAdminStatus() {
    try {
      const token = await window.Clerk?.session?.getToken();
      if (!token) {
        this.isAdmin = false;
        return;
      }

      const response = await fetch('/api/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.isAdmin = data.user?.role === 'admin' || data.user?.role === 'super_admin';
      }
    } catch (error) {
      console.warn('[ProjectsSettings] Could not check admin status:', error);
      this.isAdmin = false;
    }
  }

  /**
   * Render the main content
   */
  _renderContent() {
    this.container.innerHTML = '';

    // Projects list
    const listContainer = document.createElement('div');
    listContainer.className = 'projects-list';

    if (this.projects.length === 0) {
      listContainer.innerHTML = `
        <div class="projects-empty">
          <span class="material-icons">folder_off</span>
          <span>${this.t('projects.noProjects')}</span>
        </div>
      `;
    } else {
      this.projects.forEach(project => {
        listContainer.appendChild(this._renderProjectCard(project));
      });
    }

    this.container.appendChild(listContainer);

    // Add Project button (only for admins)
    if (this.isAdmin) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-add-rule projects-add-btn';
      addBtn.innerHTML = `
        <span class="material-icons">add</span>
        <span>${this.t('projects.addProject')}</span>
      `;
      addBtn.addEventListener('click', () => this._showCreateModal());
      this.container.appendChild(addBtn);
    }
  }

  /**
   * Render a single project card
   * @param {Object} project - Project data
   * @returns {HTMLElement} Project card element
   */
  _renderProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.projectId = project.id;

    const sketchCount = project.sketchCount || 0;
    const lastUpdated = project.updatedAt 
      ? new Date(project.updatedAt).toLocaleDateString() 
      : '-';

    card.innerHTML = `
      <div class="project-card-header">
        <span class="material-icons project-icon">folder</span>
        <div class="project-info">
          <h3 class="project-name">${this._escapeHtml(project.name)}</h3>
          <p class="project-meta">
            ${sketchCount} ${this.t('projects.sketchCount')} • ${lastUpdated}
          </p>
          ${project.description ? `<p class="project-description">${this._escapeHtml(project.description)}</p>` : ''}
        </div>
      </div>
      ${this.isAdmin ? `
        <div class="project-card-actions">
          <button class="btn btn-sm btn-edit" data-action="edit" title="${this.t('projects.editProject')}">
            <span class="material-icons">edit</span>
            <span class="btn-label">${this.t('projects.editProject')}</span>
          </button>
          <button class="btn btn-sm btn-input-flow" data-action="input-flow" title="${this.t('projects.inputFlowConfig')}">
            <span class="material-icons">settings</span>
            <span class="btn-label">${this.t('projects.inputFlowConfig')}</span>
          </button>
          <button class="btn btn-sm btn-delete" data-action="delete" title="${this.t('projects.deleteProject')}">
            <span class="material-icons">delete</span>
          </button>
        </div>
      ` : ''}
    `;

    // Attach event handlers for admin actions
    if (this.isAdmin) {
      card.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showEditModal(project);
      });

      card.querySelector('[data-action="input-flow"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._navigateToInputFlow(project);
      });

      card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._confirmDelete(project);
      });
    }

    return card;
  }

  /**
   * Show create project modal
   */
  _showCreateModal() {
    this._showProjectModal(null);
  }

  /**
   * Show edit project modal
   * @param {Object} project - Project to edit
   */
  _showEditModal(project) {
    this._showProjectModal(project);
  }

  /**
   * Show project modal (create/edit)
   * @param {Object|null} project - Project to edit, or null for new
   */
  _showProjectModal(project) {
    const isEdit = !!project;
    const title = isEdit ? this.t('projects.editProject') : this.t('projects.addProject');

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'projects-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'projects-modal';
    modal.innerHTML = `
      <div class="projects-modal-header">
        <h3>${title}</h3>
        <button class="btn-icon projects-modal-close">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="projects-modal-body">
        <div class="form-group">
          <label for="projectNameInput">${this.t('projects.projectName')}</label>
          <input type="text" id="projectNameInput" class="form-input" 
                 value="${isEdit ? this._escapeHtml(project.name) : ''}" 
                 placeholder="${this.t('projects.projectName')}..." />
        </div>
        <div class="form-group">
          <label for="projectDescInput">${this.t('projects.projectDescription')}</label>
          <textarea id="projectDescInput" class="form-input" rows="3"
                    placeholder="${this.t('projects.projectDescription')}...">${isEdit ? this._escapeHtml(project.description || '') : ''}</textarea>
        </div>
      </div>
      <div class="projects-modal-footer">
        <button class="btn btn-secondary projects-modal-cancel">${this.t('buttons.cancel')}</button>
        <button class="btn btn-primary projects-modal-save">${this.t('buttons.save')}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Focus name input
    setTimeout(() => {
      modal.querySelector('#projectNameInput')?.focus();
    }, 100);

    // Close handlers
    const closeModal = () => {
      overlay.remove();
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    modal.querySelector('.projects-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('.projects-modal-cancel')?.addEventListener('click', closeModal);

    // Save handler
    modal.querySelector('.projects-modal-save')?.addEventListener('click', async () => {
      const name = modal.querySelector('#projectNameInput')?.value?.trim();
      const description = modal.querySelector('#projectDescInput')?.value?.trim();

      if (!name) {
        this.showToast(this.t('validation.required'), 'error');
        return;
      }

      try {
        if (isEdit) {
          await this._updateProject(project.id, { name, description });
        } else {
          await this._createProject({ name, description });
        }
        closeModal();
        await this.render(); // Refresh the list
      } catch (error) {
        console.error('[ProjectsSettings] Save error:', error);
        this.showToast(error.message || 'Error saving project', 'error');
      }
    });
  }

  /**
   * Confirm delete project
   * @param {Object} project - Project to delete
   */
  _confirmDelete(project) {
    if (!confirm(this.t('projects.confirmDelete'))) {
      return;
    }
    this._deleteProject(project.id);
  }

  /**
   * Create a new project
   * @param {Object} data - Project data
   */
  async _createProject(data) {
    const token = await window.Clerk?.session?.getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create project');
    }

    this.showToast(this.t('projects.addProject') + ' ✓', 'success');
    return response.json();
  }

  /**
   * Update an existing project
   * @param {string} id - Project ID
   * @param {Object} data - Updated data
   */
  async _updateProject(id, data) {
    const token = await window.Clerk?.session?.getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update project');
    }

    this.showToast(this.t('projects.editProject') + ' ✓', 'success');
    return response.json();
  }

  /**
   * Delete a project
   * @param {string} id - Project ID
   */
  async _deleteProject(id) {
    try {
      const token = await window.Clerk?.session?.getToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete project');
      }

      this.showToast(this.t('projects.deleteProject') + ' ✓', 'success');
      await this.render(); // Refresh the list
    } catch (error) {
      console.error('[ProjectsSettings] Delete error:', error);
      this.showToast(error.message || 'Error deleting project', 'error');
    }
  }

  /**
   * Navigate to input flow settings for a project
   * @param {Object} project - Project to configure
   */
  _navigateToInputFlow(project) {
    // For now, show a toast - input flow editor can be implemented separately
    this.showToast(`${this.t('projects.inputFlowConfig')}: ${project.name}`, 'info');
    // Future: location.hash = `#/projects/${project.id}/input-flow`;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
