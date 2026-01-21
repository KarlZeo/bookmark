# 关于 MeNav

MeNav 是一个用于生成**个人导航站**的项目：

- **构建期**：使用 Node.js 作为静态站点生成器（SSG），把配置与内容渲染为 `dist/`。
- **运行时**：输出一份轻量的浏览器 runtime，用于页面交互与增强。

这页用于放置项目的说明与使用要点（你也可以改成自己的“关于”页面）。

## 适合谁

- 想要一个**可自托管、可版本管理**的导航页/起始页
- 希望用 **YAML + Markdown** 管理站点结构与内容
- 更偏好“生成静态文件再部署”，而不是运行时依赖服务端

## 快速开始

```bash
npm install
npm run dev
```

- `npm run dev`：本地开发（生成站点并启动本地服务）
- `npm run build`：生成生产构建（输出到 `dist/`）

## 项目结构（常用）

- `src/generator/`：构建期生成器（Node.js）
- `src/runtime/`：浏览器 runtime（最终会被打包到 `dist/script.js`）
- `templates/`：Handlebars 模板
- `config/`：站点配置（YAML）
- `content/`：内容页（Markdown），例如本文件
- `dist/`：构建输出（可直接部署）
- `dev/`：网络缓存（gitignored）

## 配置说明（概念）

- MeNav 的站点配置以 `config/` 下的 YAML 为主。
- **注意**：如果存在 `config/user/`，它会**完全替换** `config/_default/`（不是 merge）。

## 内容页（Markdown）说明

- 内容页的 Markdown 会在**构建期**渲染为 HTML。
- 内容页通常用于：关于、帮助、使用说明、更新记录等。

## 安全与链接处理

MeNav 对链接会做安全处理（例如限制危险的 URL scheme），以降低把不安全链接渲染到页面上的风险。

如果你在导航数据或内容页里粘贴了外部链接，建议优先使用 `https://`。

## 部署

`npm run build` 后将生成的 `dist/` 部署到任意静态站点托管即可（例如 Nginx、GitHub Pages、Cloudflare Pages 等）。

## 维护建议

- 把你的配置、内容页都纳入 git 版本管理
- 变更后跑一遍：

```bash
npm run check
```

（会依次执行语法检查、测试与构建）
