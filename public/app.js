'use strict';

(() => {
  const state = {
    content: null,
    original: null,
    authenticated: false,
    editing: false,
    dirty: false,
    saving: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const fieldElements = $$('[data-field]');
  const editorBar = $('#editor-bar');
  const editorStateText = $('#editor-state-text');
  const saveButton = $('#save-button');
  const cancelButton = $('#cancel-button');
  const logoutButton = $('#logout-button');
  const adminTrigger = $('#admin-trigger');
  const loginDialog = $('#login-dialog');
  const loginForm = $('#login-form');
  const passwordInput = $('#password');
  const loginError = $('#login-error');
  const loginSubmit = $('#login-submit');
  const toast = $('#toast');
  let toastTimer = null;

  function getPath(object, dottedPath) {
    return dottedPath.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
  }

  function setPath(object, dottedPath, value) {
    const keys = dottedPath.split('.');
    let cursor = object;
    for (let index = 0; index < keys.length - 1; index += 1) {
      const key = keys[index];
      if (cursor[key] == null || typeof cursor[key] !== 'object') cursor[key] = {};
      cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function plainText(element) {
    return (element.innerText || element.textContent || '').replace(/\r/g, '').trim();
  }

  function initials(name) {
    const value = String(name || '').trim();
    const latinWords = value.match(/[A-Za-z]+/g);
    if (latinWords && latinWords.length) {
      return latinWords.map((word) => word[0]).join('').slice(0, 2).toUpperCase();
    }
    return value.slice(0, 1) || 'ME';
  }

  function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || '请求失败，请稍后再试');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function hydrate(content) {
    state.content = content;
    fieldElements.forEach((element) => {
      const value = getPath(content, element.dataset.field);
      if (typeof value === 'string') element.textContent = value;
    });

    const name = content.site.name || '个人网站';
    const tagline = content.site.tagline || '';
    const mark = initials(name);
    $$('[data-initial]').forEach((element) => { element.textContent = mark; });

    const email = content.contact.email.trim();
    const emailLink = $('[data-email-link]');
    if (emailLink) emailLink.setAttribute('href', `mailto:${email}`);

    document.title = tagline ? `${name} — ${tagline}` : name;
    const description = $('meta[name="description"]');
    if (description) description.setAttribute('content', `${name}的个人网站。${content.intro.body}`);
    $('#year').textContent = String(new Date().getFullYear());
  }

  function collectContent() {
    if (!state.content) return null;
    const next = clone(state.content);
    fieldElements.forEach((element) => {
      setPath(next, element.dataset.field, plainText(element));
    });
    return next;
  }

  function updateEditorState() {
    if (!state.editing) return;
    editorStateText.textContent = state.dirty ? '有未保存修改' : '已保存';
    saveButton.disabled = !state.dirty || state.saving;
    saveButton.textContent = state.saving ? '发布中…' : '保存发布';
  }

  function setEditing(enabled) {
    state.editing = enabled;
    document.body.classList.toggle('is-editing', enabled);
    editorBar.hidden = !enabled;

    fieldElements.forEach((element) => {
      if (enabled) {
        element.setAttribute('contenteditable', 'true');
        element.setAttribute('spellcheck', 'false');
        element.setAttribute('role', 'textbox');
      } else {
        element.removeAttribute('contenteditable');
        element.removeAttribute('spellcheck');
        element.removeAttribute('role');
      }
    });

    if (enabled) {
      state.original = clone(state.content);
      state.dirty = false;
      adminTrigger.textContent = '编辑中';
      updateEditorState();
      window.setTimeout(() => {
        const firstField = $('[data-field="site.name"]');
        if (firstField) firstField.focus({ preventScroll: true });
      }, 260);
    } else {
      state.dirty = false;
      adminTrigger.textContent = state.authenticated ? '进入编辑' : '管理站点';
    }
  }

  async function saveContent() {
    if (!state.editing || state.saving) return;
    const next = collectContent();
    if (!next) return;

    state.saving = true;
    updateEditorState();
    try {
      await request('/api/content', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'personal-site-editor'
        },
        body: JSON.stringify({ content: next })
      });
      state.content = next;
      state.original = clone(next);
      state.dirty = false;
      hydrate(next);
      if (state.editing) setEditing(true);
      showToast(window.SITE_GITHUB ? '已提交，GitHub Pages 正在更新，约 1–2 分钟' : '已发布，所有访客都会看到最新内容');
    } catch (error) {
      if (error.status === 401) {
        state.authenticated = false;
        setEditing(false);
        openLogin('登录已过期，请重新输入密码');
      } else {
        showToast(error.message || '保存失败，请稍后再试', true);
      }
    } finally {
      state.saving = false;
      updateEditorState();
    }
  }

  function cancelEditing() {
    if (state.dirty && !window.confirm('有未保存的修改，确定取消吗？')) return;
    hydrate(state.content);
    setEditing(false);
    showToast('已取消本次修改');
  }

  function openLogin(message = '') {
    loginError.textContent = message;
    passwordInput.value = '';
    loginDialog.showModal();
    window.setTimeout(() => passwordInput.focus(), 120);
  }

  function closeLogin() {
    if (loginDialog.open) loginDialog.close();
    loginError.textContent = '';
    loginSubmit.disabled = false;
    loginSubmit.textContent = '登录并开始编辑';
  }

  async function checkSession() {
    try {
      const session = await request('/api/session');
      state.authenticated = Boolean(session.authenticated);
      adminTrigger.textContent = state.authenticated ? '进入编辑' : '管理站点';
      if (state.authenticated && window.location.hash === '#edit' && state.content) {
        setEditing(true);
      }
    } catch {
      state.authenticated = false;
    }
  }

  async function loadContent() {
    try {
      const content = await request('/api/content');
      hydrate(content);
    } catch (error) {
      showToast('内容加载失败，请刷新页面重试', true);
      console.error(error);
    }
  }

  async function copyPublicLink(trigger) {
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    showToast('公开链接已复制');
    if (trigger) {
      const previous = trigger.textContent;
      trigger.textContent = '已复制';
      window.setTimeout(() => { trigger.textContent = previous; }, 1600);
    }
  }

  async function init() {
    await Promise.all([loadContent(), checkSession()]);

    fieldElements.forEach((element) => {
      element.addEventListener('input', () => {
        if (!state.editing || state.saving) return;
        state.dirty = true;
        updateEditorState();
      });
      element.addEventListener('paste', (event) => {
        if (!state.editing) return;
        event.preventDefault();
        const text = (event.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
      });
      element.addEventListener('drop', (event) => {
        if (state.editing) event.preventDefault();
      });
    });

    adminTrigger.addEventListener('click', () => {
      if (state.editing) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast('正在编辑，修改完后点击“保存发布”');
      } else if (state.authenticated && state.content) {
        setEditing(true);
      } else {
        openLogin();
      }
    });

    saveButton.addEventListener('click', saveContent);
    cancelButton.addEventListener('click', cancelEditing);
    $('#copy-link').addEventListener('click', (event) => copyPublicLink(event.currentTarget));
    $('#share-button').addEventListener('click', () => copyPublicLink());

    logoutButton.addEventListener('click', async () => {
      if (state.dirty && !window.confirm('还有未保存的修改，确定退出吗？')) return;
      try {
        await request('/api/logout', { method: 'POST' });
      } finally {
        state.dirty = false;
        window.location.href = `${window.location.pathname}${window.location.search}`;
      }
    });

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      loginError.textContent = '';
      loginSubmit.disabled = true;
      loginSubmit.textContent = '正在验证…';
      try {
        await request('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: passwordInput.value })
        });
        state.authenticated = true;
        closeLogin();
        if (state.content) {
          setEditing(true);
          showToast('已登录，点击任意文字即可编辑');
        } else {
          showToast('登录成功，但内容尚未加载，请刷新页面', true);
        }
      } catch (error) {
        loginError.textContent = error.message || '登录失败';
        passwordInput.select();
      } finally {
        loginSubmit.disabled = false;
        loginSubmit.textContent = '登录并开始编辑';
      }
    });

    $('#login-close').addEventListener('click', closeLogin);
    $('#toggle-password').addEventListener('click', (event) => {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      event.currentTarget.textContent = showing ? '显示' : '隐藏';
      event.currentTarget.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
      passwordInput.focus();
    });

    loginDialog.addEventListener('click', (event) => {
      if (event.target === loginDialog) closeLogin();
    });

    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && state.editing) {
        event.preventDefault();
        if (state.dirty) saveContent();
      }
    });

    window.addEventListener('beforeunload', (event) => {
      if (state.editing && state.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  init();
})();