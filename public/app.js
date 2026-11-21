'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    content: null,
    filter: '全部',
    query: '',
    authenticated: false,
    publishing: false
  };

  const els = {
    projectCount: $('#project-count'),
    lastUpdate: $('#last-update'),
    filters: $('#filters'),
    search: $('#search'),
    projectGrid: $('#project-grid'),
    emptyState: $('#empty-state'),
    footerYear: $('#footer-year'),
    openUpload: $('#open-upload'),
    emptyUpload: $('#empty-upload'),
    uploadDialog: $('#upload-dialog'),
    uploadClose: $('#upload-close'),
    authPanel: $('#auth-panel'),
    authStatus: $('#auth-status'),
    token: $('#token'),
    connectButton: $('#connect-button'),
    projectForm: $('#project-form'),
    disconnectButton: $('#disconnect-button'),
    uploadStatus: $('#upload-status'),
    publishButton: $('#publish-button'),
    detailDialog: $('#detail-dialog'),
    detailClose: $('#detail-close'),
    detailContent: $('#detail-content'),
    toast: $('#toast')
  };

  function element(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = text;
    return node;
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.href);
      if (['http:', 'https:'].includes(url.protocol)) return url.href;
    } catch {
      return '';
    }
    return '';
  }

  function formatArchiveDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }

  function makeTags(tags = []) {
    const wrap = element('div', 'tags');
    tags.filter(Boolean).forEach((tag) => wrap.append(element('span', 'tag', tag)));
    return wrap;
  }

  function renderFilters() {
    const projects = state.content.projects || [];
    const categories = ['全部', ...new Set(projects.map((project) => project.category).filter(Boolean))];
    if (!categories.includes(state.filter)) state.filter = '全部';
    els.filters.replaceChildren();
    categories.forEach((category) => {
      const button = element('button', 'filter-button', category);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(state.filter === category));
      button.addEventListener('click', () => {
        state.filter = category;
        renderFilters();
        renderProjects();
      });
      els.filters.append(button);
    });
  }

  function buildCover(project, index) {
    const cover = element('div', 'project-cover');
    const image = safeUrl(project.cover);
    if (image) {
      cover.classList.add('cover-image');
      cover.style.backgroundImage = `url("${image.replaceAll('"', '%22')}")`;
    } else {
      cover.classList.add(`visual-${project.visual || 'grid'}`);
      if (project.visual === 'network') {
        ['node-one', 'node-two', 'node-three', 'node-four'].forEach((name) => cover.append(element('span', `net-node ${name}`)));
        ['line-one', 'line-two', 'line-three'].forEach((name) => cover.append(element('span', `net-line ${name}`)));
        cover.append(element('span', 'cover-word', 'MLP'));
      } else if (project.visual === 'editorial') {
        cover.append(element('span', 'editorial-copy', 'Ideas\nbecome\nprojects.'));
        cover.append(element('span', 'editorial-letter', 'Aa'));
      } else {
        cover.append(element('span', 'grid-word', 'PROJECT'));
      }
    }
    cover.append(element('span', 'cover-index', String(index + 1).padStart(2, '0')));
    cover.append(element('span', 'cover-status', project.status || project.year || ''));
    return cover;
  }

  function renderProjects() {
    const projects = Array.isArray(state.content.projects) ? state.content.projects : [];
    const query = state.query.trim().toLowerCase();
    const filtered = projects.filter((project) => {
      const categoryMatch = state.filter === '全部' || project.category === state.filter;
      const searchText = [project.title, project.summary, project.category, ...(project.tags || [])].join(' ').toLowerCase();
      return categoryMatch && (!query || searchText.includes(query));
    });

    els.projectCount.textContent = `${String(projects.length).padStart(2, '0')} PROJECTS`;
    els.projectGrid.replaceChildren();
    els.emptyState.hidden = filtered.length > 0;

    filtered.forEach((project) => {
      const card = element('article', `project-card${project.featured ? ' is-featured' : ''}`);
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `查看项目：${project.title}`);
      card.append(buildCover(project, projects.indexOf(project)));

      const body = element('div', 'project-body');
      const meta = element('div', 'project-meta');
      meta.append(element('span', '', project.category || '项目'));
      meta.append(element('span', '', project.year || ''));
      body.append(meta, element('h3', '', project.title || '未命名项目'));
      body.append(element('p', 'project-summary', project.summary || ''));

      const footer = element('div', 'project-footer');
      footer.append(makeTags(project.tags));
      footer.append(element('span', 'card-arrow', '↗'));
      body.append(footer);
      card.append(body);

      const open = () => openProject(project);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
      els.projectGrid.append(card);
    });
  }

  function renderContent() {
    document.title = `${state.content.site?.name || 'lain'} · 项目档案`;
    els.lastUpdate.textContent = state.content.site?.updated || formatArchiveDate();
    els.footerYear.textContent = new Date().getFullYear();
    renderFilters();
    renderProjects();
  }

  async function loadContent() {
    const response = await fetch(`content.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`项目数据读取失败 (${response.status})`);
    state.content = await response.json();
    if (!Array.isArray(state.content.projects)) throw new Error('content.json 缺少 projects 数组');
  }
  function openProject(project) {
    const hero = element('header', 'detail-hero');
    hero.append(element('p', 'eyebrow', `PROJECT / ${project.category || 'WORK'}`));
    hero.append(element('h2', '', project.title || '未命名项目'));
    hero.append(element('p', '', project.summary || ''));
    els.detailContent.replaceChildren(hero);

    const body = element('div', 'detail-body');
    const meta = element('div', 'detail-meta');
    [project.category, project.year, project.status, ...(project.tags || [])].filter(Boolean).forEach((item) => meta.append(element('span', '', item)));
    body.append(meta);

    const copy = element('div', 'detail-copy');
    const paragraphs = Array.isArray(project.description) && project.description.length ? project.description : [project.summary].filter(Boolean);
    paragraphs.forEach((paragraph) => copy.append(element('p', '', paragraph)));
    body.append(copy);

    const actions = element('div', 'detail-actions');
    (project.links || []).forEach((link, index) => {
      const url = safeUrl(link.url);
      if (!url) return;
      const anchor = element('a', `detail-link${index === 0 ? ' is-primary' : ''}`, `${link.label || '打开项目'} ↗`);
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      actions.append(anchor);
    });
    if (actions.childNodes.length) body.append(actions);
    els.detailContent.append(body);
    showDialog(els.detailDialog);
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
  }

  function closeDialog(dialog) {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (!document.querySelector('dialog[open]')) document.body.style.overflow = '';
  }

  async function openUploadDialog() {
    if (!els.uploadDialog.open) showDialog(els.uploadDialog);
    els.authStatus.textContent = '';
    els.uploadStatus.textContent = '';
    try {
      const response = await fetch('/api/session', { cache: 'no-store' });
      const session = await response.json();
      state.authenticated = Boolean(session.authenticated);
    } catch {
      state.authenticated = false;
    }
    updateAuthView();
  }

  function updateAuthView() {
    els.authPanel.hidden = state.authenticated;
    els.projectForm.hidden = !state.authenticated;
    if (!state.authenticated) els.token.focus();
  }

  async function connectGitHub() {
    const token = els.token.value.trim();
    if (!token) {
      els.authStatus.textContent = '请输入 GitHub Token。';
      return;
    }
    els.connectButton.disabled = true;
    els.authStatus.textContent = '正在验证仓库权限…';
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: token })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '连接失败');
      state.authenticated = true;
      els.token.value = '';
      els.authStatus.textContent = '';
      updateAuthView();
    } catch (error) {
      els.authStatus.textContent = error.message || 'GitHub 连接失败。';
    } finally {
      els.connectButton.disabled = false;
    }
  }

  async function disconnectGitHub() {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // The session may already be gone.
    }
    state.authenticated = false;
    updateAuthView();
  }

  function parseTags(value) {
    return [...new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))];
  }

  function resetForm() {
    els.projectForm.reset();
    const year = $('#project-year');
    const category = $('#project-category');
    if (year) year.value = String(new Date().getFullYear());
    if (category) category.value = '项目';
  }

  async function publishProject(event) {
    event.preventDefault();
    if (state.publishing) return;

    const title = $('#project-title').value.trim();
    const summary = $('#project-summary').value.trim();
    if (!title || !summary) {
      els.uploadStatus.textContent = '请填写项目名称和项目简介。';
      return;
    }

    const url = safeUrl($('#project-url').value.trim());
    const cover = safeUrl($('#project-cover').value.trim());
    const year = $('#project-year').value.trim() || String(new Date().getFullYear());
    const category = $('#project-category').value.trim() || '项目';
    const tags = parseTags($('#project-tags').value);
    const newProject = {
      id: `project-${Date.now().toString(36)}`,
      title,
      category,
      year,
      status: $('#project-status').value,
      featured: $('#project-featured').checked,
      visual: $('#project-visual').value,
      summary,
      description: [summary],
      tags,
      links: url ? [{ label: '打开项目', url }] : []
    };
    if (cover) newProject.cover = cover;

    const nextContent = {
      ...state.content,
      site: { ...(state.content.site || {}), updated: formatArchiveDate() },
      projects: [newProject, ...(state.content.projects || [])]
    };

    state.publishing = true;
    els.publishButton.disabled = true;
    els.uploadStatus.textContent = '正在提交到 GitHub…';
    try {
      const response = await fetch('/api/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: nextContent })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '发布失败');
      state.content = nextContent;
      renderContent();
      resetForm();
      closeDialog(els.uploadDialog);
      showToast('项目已上传。GitHub Pages 通常会在 1–2 分钟内更新。');
    } catch (error) {
      els.uploadStatus.textContent = error.message || '发布失败，请检查 Token 权限。';
    } finally {
      state.publishing = false;
      els.publishButton.disabled = false;
    }
  }

  let toastTimer = 0;
  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 5200);
  }

  function bindDialog(dialog, closeButton) {
    closeButton.addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.style.overflow = '';
    });
  }

  function bindEvents() {
    els.search.addEventListener('input', () => {
      state.query = els.search.value;
      renderProjects();
    });
    els.openUpload.addEventListener('click', openUploadDialog);
    els.emptyUpload.addEventListener('click', openUploadDialog);
    els.connectButton.addEventListener('click', connectGitHub);
    els.disconnectButton.addEventListener('click', disconnectGitHub);
    els.projectForm.addEventListener('submit', publishProject);
    bindDialog(els.detailDialog, els.detailClose);
    bindDialog(els.uploadDialog, els.uploadClose);
  }

  async function init() {
    bindEvents();
    try {
      await loadContent();
      renderContent();
    } catch (error) {
      state.content = { site: { name: 'lain', updated: formatArchiveDate() }, projects: [] };
      renderContent();
      els.emptyState.hidden = false;
      els.emptyState.querySelector('p').textContent = `项目数据加载失败：${error.message}`;
      console.error(error);
    }
  }

  init();
})();