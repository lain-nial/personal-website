'use strict';

(() => {
  const config = window.SITE_GITHUB;
  if (!config || !config.owner || !config.repo) return;

  const nativeFetch = window.fetch.bind(window);
  const TOKEN_KEY = `personal_site_github_token_${config.owner}_${config.repo}`;
  const API = 'https://api.github.com';
  const CONTENT_PATH = 'public/content.json';
  const branch = config.branch || 'main';

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  function getToken() {
    return window.sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function githubHeaders(token) {
    return {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`
    };
  }

  async function githubRequest(path, token, options = {}) {
    return nativeFetch(`${API}${path}`, {
      ...options,
      headers: {
        ...githubHeaders(token),
        ...(options.headers || {})
      }
    });
  }

  async function repositoryAccess(token) {
    const response = await githubRequest(`/repos/${config.owner}/${config.repo}`, token);
    return response.ok;
  }

  function base64EncodeUnicode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  async function getPublishedContent() {
    const url = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${branch}/${CONTENT_PATH}?t=${Date.now()}`;
    const response = await nativeFetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('无法读取网站内容');
    return response.text();
  }

  async function savePublishedContent(content, token) {
    const currentResponse = await githubRequest(
      `/repos/${config.owner}/${config.repo}/contents/${CONTENT_PATH}?ref=${branch}&t=${Date.now()}`,
      token
    );
    if (!currentResponse.ok) {
      throw new Error(currentResponse.status === 401 ? 'GitHub 授权已失效，请重新登录' : '无法读取 GitHub 中的内容文件');
    }
    const current = await currentResponse.json();
    const serialized = `${JSON.stringify(content, null, 2)}\n`;
    const updateResponse = await githubRequest(
      `/repos/${config.owner}/${config.repo}/contents/${CONTENT_PATH}`,
      token,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `更新个人网站文字 ${new Date().toISOString()}`,
          content: base64EncodeUnicode(serialized),
          branch,
          sha: current.sha
        })
      }
    );
    if (!updateResponse.ok) {
      const error = await updateResponse.json().catch(() => ({}));
      throw new Error(error.message || '提交到 GitHub 失败');
    }
    return updateResponse.json();
  }

  window.fetch = async (input, init = {}) => {
    let url;
    try {
      url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    } catch {
      return nativeFetch(input, init);
    }

    if (url.origin !== window.location.origin) return nativeFetch(input, init);

    if (url.pathname === '/api/session' && (!init.method || init.method === 'GET')) {
      return jsonResponse({ authenticated: Boolean(getToken()) });
    }

    if (url.pathname === '/api/login' && init.method === 'POST') {
      try {
        const body = JSON.parse(init.body || '{}');
        const token = String(body.password || '').trim();
        if (!token) return jsonResponse({ error: '请输入 GitHub 访问令牌' }, 401);
        if (!(await repositoryAccess(token))) {
          return jsonResponse({ error: '令牌无效，或没有该仓库的访问权限' }, 401);
        }
        window.sessionStorage.setItem(TOKEN_KEY, token);
        return jsonResponse({ authenticated: true });
      } catch (error) {
        return jsonResponse({ error: error.message || 'GitHub 连接失败' }, 500);
      }
    }

    if (url.pathname === '/api/logout' && init.method === 'POST') {
      window.sessionStorage.removeItem(TOKEN_KEY);
      return jsonResponse({ authenticated: false });
    }

    if (url.pathname === '/api/content' && (!init.method || init.method === 'GET')) {
      try {
        const raw = await getPublishedContent();
        return new Response(raw, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      } catch (error) {
        return jsonResponse({ error: error.message }, 500);
      }
    }

    if (url.pathname === '/api/content' && init.method === 'PUT') {
      const token = getToken();
      if (!token) return jsonResponse({ error: '请先登录 GitHub' }, 401);
      try {
        const body = JSON.parse(init.body || '{}');
        await savePublishedContent(body.content, token);
        return jsonResponse({ ok: true, savedAt: new Date().toISOString() });
      } catch (error) {
        return jsonResponse({ error: error.message || '保存失败' }, 500);
      }
    }

    return nativeFetch(input, init);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const label = document.querySelector('label[for="password"]');
    const input = document.querySelector('#password');
    const copy = document.querySelector('.dialog-copy');
    const footnote = document.querySelector('.dialog-footnote');
    const eyebrow = document.querySelector('.dialog-eyebrow');
    if (label) label.textContent = 'GitHub 访问令牌';
    if (input) {
      input.placeholder = '粘贴 GitHub Token';
      input.autocomplete = 'off';
    }
    if (copy) copy.textContent = '粘贴一个有 Contents 读写权限的 GitHub Token。令牌只保存在当前浏览器标签页中，不会写入公开网站。';
    if (footnote) footnote.textContent = '保存后会提交到 GitHub，GitHub Pages 通常会在 1–2 分钟内自动更新。';
    if (eyebrow) eyebrow.textContent = 'GITHUB EDITOR';
  });
})();