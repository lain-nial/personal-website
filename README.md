# 个人网站

这是通过 GitHub Pages 发布的个人网站。

## 在线编辑

1. 打开网站的“管理站点”。
2. 输入一个有该仓库 **Contents 读写权限** 的 GitHub Token。
3. 点击文字直接修改，点击“保存发布”。
4. 修改会提交到 `public/content.json`，GitHub Pages 通常会在 1–2 分钟内更新。

Token 只保存在当前浏览器标签页中，不会写入网站或仓库。

## 文件

- `public/index.html`：页面结构
- `public/styles.css`：页面样式
- `public/app.js`：页面逻辑
- `public/content.json`：网站文字
- `public/github-adapter.js`：通过 GitHub API 保存文字
- `.github/workflows/pages.yml`：自动发布到 GitHub Pages