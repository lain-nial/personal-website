# lain · 项目档案

一个深色、无构建工具的个人项目展示站，只保留两项核心功能：

1. 展示项目
2. 通过 GitHub Token 上传新项目

## 文件结构

- `public/index.html`：项目档案页面、上传表单与项目详情弹窗
- `public/styles.css`：深色主题和响应式样式
- `public/app.js`：项目渲染、筛选、搜索、上传和详情逻辑
- `public/content.json`：项目数据
- `public/mlp-lab.html`：保留下来的 MLP 项目演示
- `public/github-adapter.js`：通过 GitHub API 保存项目数据
- `.github/workflows/pages.yml`：GitHub Pages 自动部署
- `preview.ps1`：Windows 本地预览脚本

## 上传新项目

1. 点击页面右上角“上传项目”。
2. 第一次使用时，粘贴一个具有本仓库 `Contents: Read and write` 权限的 GitHub Fine-grained Token。
3. 填写项目名称、简介、链接、封面、类别、标签等信息。
4. 点击“发布项目”。
5. GitHub Pages 通常会在 1–2 分钟内自动更新。

Token 只保存在当前浏览器标签页的 `sessionStorage` 中，不会写入公开网站或仓库。

## content.json 项目结构

```json
{
  "id": "project-example",
  "title": "项目名称",
  "category": "网站",
  "year": "2026",
  "status": "已发布",
  "featured": false,
  "visual": "grid",
  "summary": "项目简介",
  "description": ["详细说明第一段", "详细说明第二段"],
  "tags": ["JavaScript", "交互设计"],
  "cover": "https://example.com/cover.jpg",
  "links": [
    { "label": "打开项目", "url": "https://example.com" }
  ]
}
```

`visual` 可使用 `grid`、`network` 或 `editorial`。设置 `cover` 后会优先显示封面图片。

## 本地预览

在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\preview.ps1
```

访问 `http://127.0.0.1:4173/`。

## 发布

将 `public/` 和 `.github/workflows/pages.yml` 推送到仓库的 `main` 分支，GitHub Pages 会自动部署。