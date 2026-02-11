/**
 * Projects Settings Module
 * 
 * This module provides a ProjectsSettings class for managing projects
 * with full CRUD functionality following the vision document design.
 */

import { InputFlowSettings } from './input-flow-settings.js';

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
      // Better Auth uses cookie-based sessions
      const authState = window.authGuard?.getAuthState?.() || {};
      if (!authState.isSignedIn) {
        console.warn('[ProjectsSettings] Not authenticated');
        this.projects = [];
        return;
      }

      const response = await fetch('/api/projects', {
        credentials: 'include',
        headers: {
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
      // Better Auth uses cookie-based sessions
      const authState = window.authGuard?.getAuthState?.() || {};
      if (!authState.isSignedIn) {
        this.isAdmin = false;
        return;
      }

      const response = await fetch('/api/user-role', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // /api/user-role returns isAdmin directly (true for admin or super_admin)
        this.isAdmin = data.isAdmin === true;
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
          <button class="btn btn-sm btn-layers" data-action="layers" title="${this.t('projects.manageLayers') || 'Manage Layers'}">
            <span class="material-icons">layers</span>
            <span class="btn-label">${this.t('projects.manageLayers') || 'Manage Layers'}</span>
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

      card.querySelector('[data-action="layers"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showLayersModal(project);
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
    // Better Auth uses cookie-based sessions
    const authState = window.authGuard?.getAuthState?.() || {};
    if (!authState.isSignedIn) throw new Error('Not authenticated');

    const response = await fetch('/api/projects', {
      method: 'POST',
      credentials: 'include',
      headers: {
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
    // Better Auth uses cookie-based sessions
    const authState = window.authGuard?.getAuthState?.() || {};
    if (!authState.isSignedIn) throw new Error('Not authenticated');

    const response = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
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
      // Better Auth uses cookie-based sessions
      const authState = window.authGuard?.getAuthState?.() || {};
      if (!authState.isSignedIn) throw new Error('Not authenticated');

      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
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
    // Store current content
    const originalContent = this.container.innerHTML;
    
    // Create input flow settings UI
    this.container.innerHTML = '';
    
    const inputFlowSettings = new InputFlowSettings({
      container: this.container,
      config: project.inputFlowConfig || {},
      t: this.t,
      project: project,
      onSave: async (newConfig) => {
        try {
          // Save the updated config to the project
          await this._updateProjectInputFlow(project.id, newConfig);
          this.showToast(this.t('inputFlow.title') + ' ✓', 'success');
          // Return to projects list
          await this.render();
        } catch (error) {
          console.error('[ProjectsSettings] Error saving input flow config:', error);
          this.showToast(error.message || 'Error saving configuration', 'error');
        }
      },
      onCancel: () => {
        // Return to projects list
        this.render();
      }
    });
    
    inputFlowSettings.render();
  }

  /**
   * Update project input flow configuration
   * @param {string} projectId - Project ID
   * @param {Object} inputFlowConfig - New input flow configuration
   */
  async _updateProjectInputFlow(projectId, inputFlowConfig) {
    const authState = window.authGuard?.getAuthState?.() || {};
    if (!authState.isSignedIn) throw new Error('Not authenticated');

    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputFlowConfig })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update input flow configuration');
    }

    return response.json();
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  /**
   * Show layers management modal for a project
   * @param {Object} project - Project to manage layers for
   */
  async _showLayersModal(project) {
    const overlay = document.createElement('div');
    overlay.className = 'projects-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'projects-modal projects-modal--wide';
    modal.innerHTML = `
      <div class="projects-modal-header">
        <h3>${this.t('projects.manageLayers') || 'Reference Layers'} — ${this._escapeHtml(project.name)}</h3>
        <button class="btn-icon projects-modal-close">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="projects-modal-body">
        <div id="layersListContainer" class="layers-list-container">
          <div class="projects-loading">
            <span class="material-icons spin">sync</span>
            <span>Loading layers...</span>
          </div>
        </div>
        <div class="layers-upload-section">
          <h4>${this.t('projects.uploadLayer') || 'Upload GeoJSON Layer'}</h4>
          <div class="form-group">
            <label>${this.t('projects.layerName') || 'Layer Name'}</label>
            <input type="text" id="newLayerName" class="form-input" placeholder="e.g. Sections, Streets..." />
          </div>
          <div class="form-group">
            <label>${this.t('projects.layerType') || 'Layer Type'}</label>
            <select id="newLayerType" class="form-input">
              <option value="sections">${this.t('refLayers.sections') || 'Sections'}</option>
              <option value="survey_manholes">${this.t('refLayers.surveyManholes') || 'Survey Manholes'}</option>
              <option value="survey_pipes">${this.t('refLayers.surveyPipes') || 'Survey Pipes'}</option>
              <option value="streets">${this.t('refLayers.streets') || 'Streets'}</option>
              <option value="addresses">${this.t('refLayers.addresses') || 'Addresses'}</option>
            </select>
          </div>
          <div class="form-group">
            <label>${this.t('projects.geojsonFile') || 'GeoJSON File'}</label>
            <input type="file" id="geojsonFileInput" accept=".geojson,.json" class="form-input" />
          </div>
          <button id="uploadLayerBtn" class="btn btn-primary">
            <span class="material-icons">upload</span>
            ${this.t('projects.uploadLayer') || 'Upload Layer'}
          </button>
        </div>
      </div>
      <div class="projects-modal-footer">
        <button class="btn btn-secondary projects-modal-close">${this.t('buttons.close') || 'Close'}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    modal.querySelectorAll('.projects-modal-close').forEach(btn => btn.addEventListener('click', closeModal));

    // Load existing layers
    await this._loadLayersList(project.id, modal.querySelector('#layersListContainer'));

    // Upload handler
    modal.querySelector('#uploadLayerBtn')?.addEventListener('click', async () => {
      const name = modal.querySelector('#newLayerName')?.value?.trim();
      const layerType = modal.querySelector('#newLayerType')?.value;
      const fileInput = modal.querySelector('#geojsonFileInput');
      const file = fileInput?.files?.[0];

      if (!name) {
        this.showToast(this.t('validation.required') || 'Name is required', 'error');
        return;
      }
      if (!file) {
        this.showToast('Please select a GeoJSON file', 'error');
        return;
      }

      try {
        const text = await file.text();
        const geojson = JSON.parse(text);

        if (!geojson.type || !geojson.features) {
          this.showToast('Invalid GeoJSON: must be a FeatureCollection', 'error');
          return;
        }

        const response = await fetch('/api/layers', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            name,
            layerType,
            geojson
          })
        });

        if (!response.ok) {
          let errorMsg = 'Failed to upload layer';
          try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const err = await response.json();
              errorMsg = err.error || errorMsg;
            } else {
              const text = await response.text();
              if (response.status === 413) {
                errorMsg = 'File is too large for the web interface (max ~5MB). Try running "node scripts/slim_geojson.js" to compress it, or use the CLI import script.';
              } else {
                console.warn('[ProjectsSettings] Non-JSON error response:', text.substring(0, 100));
              }
            }
          } catch (e) {
            console.error('[ProjectsSettings] Error parsing error response:', e);
          }
          throw new Error(errorMsg);
        }

        this.showToast(`Layer "${name}" uploaded successfully`, 'success');
        
        // Clear form
        modal.querySelector('#newLayerName').value = '';
        fileInput.value = '';
        
        // Reload list
        await this._loadLayersList(project.id, modal.querySelector('#layersListContainer'));
      } catch (error) {
        console.error('[ProjectsSettings] Layer upload error:', error);
        this.showToast(error.message || 'Error uploading layer', 'error');
      }
    });
  }

  /**
   * Load and render the layers list inside a container
   * @param {string} projectId
   * @param {HTMLElement} container
   */
  async _loadLayersList(projectId, container) {
    try {
      const response = await fetch(`/api/layers?projectId=${projectId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch layers');
      const data = await response.json();
      const layers = data.layers || [];

      if (layers.length === 0) {
        container.innerHTML = `<p class="layers-empty">${this.t('projects.noLayers') || 'No reference layers configured for this project.'}</p>`;
        return;
      }

      container.innerHTML = layers.map(layer => `
        <div class="layer-card" data-layer-id="${layer.id}">
          <div class="layer-card-info">
            <span class="material-icons layer-icon">layers</span>
            <div>
              <strong>${this._escapeHtml(layer.name)}</strong>
              <span class="layer-type-badge">${layer.layerType}</span>
            </div>
          </div>
          <div class="layer-card-actions">
            <label class="layer-visibility-toggle" title="Toggle visibility">
              <input type="checkbox" ${layer.visible ? 'checked' : ''} data-layer-toggle="${layer.id}" />
              <span class="material-icons">${layer.visible ? 'visibility' : 'visibility_off'}</span>
            </label>
            <button class="btn btn-sm btn-delete" data-delete-layer="${layer.id}" title="Delete">
              <span class="material-icons">delete</span>
            </button>
          </div>
        </div>
      `).join('');

      // Attach toggle handlers
      container.querySelectorAll('[data-layer-toggle]').forEach(cb => {
        cb.addEventListener('change', async (e) => {
          const layerId = e.target.dataset.layerToggle;
          const visible = e.target.checked;
          try {
            await fetch(`/api/layers/${layerId}`, {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ visible })
            });
            const icon = e.target.parentElement.querySelector('.material-icons');
            if (icon) icon.textContent = visible ? 'visibility' : 'visibility_off';
          } catch (err) {
            console.error('[ProjectsSettings] Failed to toggle layer visibility:', err.message);
          }
        });
      });

      // Attach delete handlers
      container.querySelectorAll('[data-delete-layer]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const layerId = btn.dataset.deleteLayer;
          if (!confirm(this.t('projects.confirmDeleteLayer') || 'Delete this layer?')) return;
          try {
            const resp = await fetch(`/api/layers/${layerId}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            if (!resp.ok) throw new Error('Delete failed');
            this.showToast('Layer deleted', 'success');
            await this._loadLayersList(projectId, container);
          } catch (err) {
            console.error('[ProjectsSettings] Failed to delete layer:', err.message);
            this.showToast('Error deleting layer', 'error');
          }
        });
      });
    } catch (error) {
      console.error('[ProjectsSettings] Error loading layers:', error);
      container.innerHTML = `<p class="layers-error">Failed to load layers</p>`;
    }
  }

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
