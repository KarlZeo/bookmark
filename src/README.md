# MeNav 源代码目录

## 目录

- [架构概述](#架构概述)
- [目录结构](#目录结构)
  - [生成端（generator）](#生成端generator)
  - [运行时（runtime）](#运行时runtime)
  - [辅助函数（helpers）](#辅助函数helpers)
- [模块化开发规范](#模块化开发规范)
  - [职责单一性原则](#职责单一性原则)
  - [文件大小规范](#文件大小规范)
  - [命名规范](#命名规范)
  - [依赖管理](#依赖管理)
- [开发指南](#开发指南)
  - [添加新模块](#添加新模块)
  - [修改现有模块](#修改现有模块)
  - [测试要求](#测试要求)

## 架构概述

MeNav 采用**模块化架构**，将代码按职责拆分为独立的、可维护的模块。整体分为三个主要部分：

1. **生成端（generator）**：构建期代码，负责将配置转换为静态 HTML
2. **运行时（runtime）**：浏览器端代码，负责用户交互和动态功能
3. **辅助函数（helpers）**：Handlebars 模板辅助函数

### 架构原则

- ✅ **职责单一**：每个模块只负责一件事
- ✅ **高内聚低耦合**：模块内部紧密相关，模块间松散依赖
- ✅ **可测试性**：每个模块都可以独立测试
- ✅ **可维护性**：清晰的目录结构和命名规范

## 目录结构

```text
src/
├── generator.js              # 生成端薄入口（14行）
├── generator/                # 生成端实现
│   ├── main.js              # 主流程控制（301行）
│   ├── cache/               # 缓存处理
│   │   ├── articles.js      # 文章缓存（159行）
│   │   └── projects.js      # 项目缓存（135行）
│   ├── config/              # 配置管理
│   │   ├── index.js         # 配置入口（61行）
│   │   ├── loader.js        # 配置加载（89行）
│   │   ├── validator.js     # 配置验证（90行）
│   │   ├── resolver.js      # 配置解析（146行）
│   │   └── slugs.js         # Slug 生成（43行）
│   ├── html/                # HTML 生成
│   │   ├── 404.js           # 404 页面（94行）
│   │   ├── components.js    # 组件生成（208行）
│   │   ├── fonts.js         # 字体处理（155行）
│   │   └── page-data.js     # 页面数据准备（161行）
│   ├── template/            # 模板引擎
│   │   └── engine.js        # Handlebars 引擎（120行）
│   └── utils/               # 工具函数
│       ├── html.js          # HTML 工具（17行）
│       ├── pageMeta.js      # 页面元信息（101行）
│       └── sites.js         # 站点处理（35行）
├── runtime/                 # 运行时实现
│   ├── index.js             # 运行时入口（18行）
│   ├── shared.js            # 共享工具（142行）
│   ├── tooltip.js           # 提示框（115行）
│   ├── app/                 # 应用逻辑
│   │   ├── index.js         # 应用入口（112行）
│   │   ├── routing.js       # 路由管理（403行）
│   │   ├── search.js        # 搜索功能（440行）
│   │   ├── searchEngines.js # 搜索引擎（25行）
│   │   ├── ui.js            # UI 交互（181行）
│   │   └── search/
│   │       └── highlight.js # 搜索高亮（90行）
│   ├── menav/               # 扩展 API
│   │   ├── index.js         # API 入口（70行）
│   │   ├── addElement.js    # 添加元素（351行）
│   │   ├── updateElement.js # 更新元素（166行）
│   │   ├── removeElement.js # 删除元素（26行）
│   │   ├── getAllElements.js# 获取元素（11行）
│   │   ├── getConfig.js     # 获取配置（25行）
│   │   └── events.js        # 事件系统（34行）
│   └── nested/              # 嵌套书签
│       └── index.js         # 嵌套功能（230行）
└── helpers/                 # Handlebars 辅助函数
    ├── index.js             # 辅助函数注册
    ├── formatters.js        # 格式化函数
    ├── conditions.js        # 条件判断
    └── utils.js             # 工具函数
```

## 生成端（generator）

### 生成端职责

将 YAML 配置文件转换为静态 HTML 网站。

### 生成端核心模块

#### config/ - 配置管理

- **loader.js**：从文件系统加载 YAML 配置
- **validator.js**：验证配置合法性，填充默认值
- **resolver.js**：解析配置，准备渲染数据
- **slugs.js**：为分类生成唯一标识符

#### html/ - HTML 生成

- **page-data.js**：准备页面渲染数据（处理 projects/articles/bookmarks 特殊逻辑）
- **components.js**：生成导航、分类、社交链接等组件
- **fonts.js**：处理字体链接和 CSS
- **404.js**：生成 404 页面

#### cache/ - 缓存处理

- **articles.js**：处理 RSS 文章缓存
- **projects.js**：处理 GitHub 项目缓存

#### template/ - 模板引擎

- **engine.js**：Handlebars 模板加载和渲染

#### utils/ - 工具函数

- **pageMeta.js**：获取页面元信息（git 时间戳等）
- **sites.js**：递归收集站点数据
- **html.js**：HTML 处理工具

### 生成端入口文件

- **generator.js**：薄入口，re-export `generator/main.js`
- **main.js**：主流程控制，协调各模块完成构建

## 运行时（runtime）

### 运行时职责

在浏览器中提供用户交互功能和扩展 API。

### 运行时核心模块

#### app/ - 应用逻辑

- **routing.js**：页面路由、URL 处理、页面切换
- **search.js**：搜索索引、搜索逻辑、搜索引擎切换
- **ui.js**：UI 交互（侧边栏、主题切换、滚动等）
- **searchEngines.js**：外部搜索引擎配置

#### menav/ - 扩展 API

提供 `window.MeNav` API，供浏览器扩展使用：

- **addElement.js**：添加站点/分类/页面
- **updateElement.js**：更新元素属性
- **removeElement.js**：删除元素
- **getAllElements.js**：获取所有元素
- **getConfig.js**：获取配置
- **events.js**：事件系统（on/off/emit）

#### nested/ - 嵌套书签

- **index.js**：嵌套书签功能（展开/折叠/结构管理）

### 运行时入口文件

- **index.js**：运行时入口，初始化所有模块
- **shared.js**：共享工具函数（URL 校验、class 清洗等）
- **tooltip.js**：站点卡片悬停提示

### 构建流程

运行时代码通过 `scripts/build-runtime.js` 打包：

- 入口：`src/runtime/index.js`
- 输出：`dist/script.js`（IIFE 格式，单文件）
- 工具：esbuild

## 辅助函数（helpers）

### 辅助函数职责

为 Handlebars 模板提供辅助函数。

### 辅助函数模块

- **formatters.js**：日期格式化、文本处理
- **conditions.js**：条件判断、逻辑运算
- **utils.js**：数组处理、对象操作、URL 校验
- **index.js**：注册所有辅助函数到 Handlebars

## 模块化开发规范

### 职责单一性原则

**定义**：一个模块应该只负责一件事情，只有一个改变的理由。

**判断方法**：

1. 能用一句话描述模块职责
2. 只有一个理由会修改这个模块
3. 函数/变量名清晰反映职责

**示例**：

✅ **好的拆分**：

```javascript
// config/loader.js - 只负责加载配置
function loadModularConfig(dirPath) { /* ... */ }

// config/validator.js - 只负责验证配置
function validateConfig(config) { /* ... */ }

// config/resolver.js - 只负责解析配置
function prepareRenderData(config) { /* ... */ }
```

❌ **不好的拆分**：

```javascript
// config.js - 职责混杂
function processConfig(config) {
  // 加载、验证、解析、转换... 400 行代码
}
```

### 文件大小规范

**目标**：

- 源码文件：≤ 500 行
- 理想大小：100-300 行
- 入口文件：≤ 100 行（薄入口）

**超过 500 行时**：

1. 检查是否职责混杂
2. 拆分为多个子模块
3. 提取可复用的工具函数

**当前状态**：

- 最大文件：440 行（search.js）
- 平均文件：~130 行
- 33 个模块文件

### 命名规范

#### 文件命名

- 使用 kebab-case：`page-data.js`、`search-engine.js`
- 名称反映职责：`loader.js`、`validator.js`、`resolver.js`
- 入口文件：`index.js`

#### 函数命名

- 使用 camelCase：`loadConfig`、`validateConfig`
- 动词开头：`get`、`set`、`load`、`validate`、`prepare`
- 清晰描述功能：`preparePageData`、`assignCategorySlugs`

#### 目录命名

- 使用 kebab-case：`page-data/`、`search-engine/`
- 名称反映功能域：`config/`、`cache/`、`html/`

### 依赖管理

#### 导入规范

```javascript
// 1. Node 内置模块
const fs = require('node:fs');
const path = require('node:path');

// 2. 第三方依赖
const yaml = require('js-yaml');

// 3. 项目内部模块（相对路径）
const { loadConfig } = require('./config');
const { renderTemplate } = require('./template/engine');
```

#### 导出规范

```javascript
// 单个导出
module.exports = function initSearch(state, dom) { /* ... */ };

// 多个导出
module.exports = {
  loadConfig,
  validateConfig,
  prepareRenderData,
};
```

#### 循环依赖

- ❌ 避免循环依赖
- ✅ 通过依赖注入解决
- ✅ 提取共享代码到独立模块

## 开发指南

### 添加新模块

#### 1. 确定模块位置

**生成端**（构建期代码）：

```text
src/generator/
├── cache/      # 缓存处理
├── config/     # 配置管理
├── html/       # HTML 生成
├── template/   # 模板引擎
└── utils/      # 工具函数
```

**运行时**（浏览器代码）：

```text
src/runtime/
├── app/        # 应用逻辑
├── menav/      # 扩展 API
└── nested/     # 嵌套书签
```

#### 2. 创建模块文件

```javascript
// src/generator/config/new-module.js

/**
 * 模块描述
 * @param {Object} param - 参数说明
 * @returns {Object} 返回值说明
 */
function newFunction(param) {
  // 实现逻辑
}

module.exports = {
  newFunction,
};
```

#### 3. 更新入口文件

```javascript
// src/generator/config/index.js
const { newFunction } = require('./new-module');

module.exports = {
  // ... 其他导出
  newFunction,
};
```

#### 4. 添加测试

```javascript
// test/new-module.test.js
const { newFunction } = require('../src/generator/config/new-module');

test('newFunction 应该...', () => {
  const result = newFunction(input);
  expect(result).toBe(expected);
});
```

### 修改现有模块

#### 1. 理解模块职责

- 阅读模块注释
- 查看函数签名
- 理解依赖关系

#### 2. 保持职责单一

- 不要在模块中添加无关功能
- 如果功能不匹配，创建新模块

#### 3. 运行测试

```bash
npm test                    # 运行所有测试
npm run build              # 验证构建
```

#### 4. 更新文档

- 更新函数注释
- 更新 README（如有必要）

### 测试要求

#### 单元测试

- 每个模块都应有对应的测试文件
- 测试覆盖核心功能路径
- 使用 Node.js 内置测试框架

#### 集成测试

- 测试模块间的协作
- 验证构建产物
- 检查扩展契约

#### 测试命令

```bash
npm test                    # 运行所有测试
npm run lint               # 代码检查
npm run format:check       # 格式检查
```

## 最佳实践

### 1. 先读后写

- 修改代码前，先用 Read 工具读取文件
- 理解现有逻辑再进行修改

### 2. 小步迭代

- 每次只改一个模块
- 改完立即测试
- 确认无误后再继续

### 3. 保持一致性

- 遵循现有的代码风格
- 使用相同的命名规范
- 保持目录结构一致

### 4. 文档同步

- 代码变更时更新注释
- 重要改动更新 README
- 保持文档与代码一致

### 5. 测试先行

- 修改前运行测试（确保基线）
- 修改后运行测试（验证功能）
- 新功能添加测试（保证质量）

## 常见问题

### Q: 如何判断代码应该放在哪个模块？

**A**: 问自己三个问题：

1. 这段代码的职责是什么？（加载/验证/解析/渲染...）
2. 它属于哪个功能域？（配置/缓存/HTML/模板...）
3. 它在构建期还是运行时执行？（generator/runtime）

### Q: 模块太大了怎么办？

**A**: 拆分步骤：

1. 识别模块中的不同职责
2. 为每个职责创建独立模块
3. 更新入口文件的导入/导出
4. 运行测试验证

### Q: 如何避免循环依赖？

**A**: 三种方法：

1. 提取共享代码到独立模块
2. 使用依赖注入
3. 重新设计模块边界

### Q: 什么时候应该创建新目录？

**A**: 当满足以下条件时：

1. 有 3 个以上相关模块
2. 这些模块属于同一功能域
3. 需要独立的入口文件（index.js）

## 参考资料

- [P2-1 模块化重构文档](../../docs/2025-12-29_修复清单.md#p2-1-文件过大)
- [职责单一性原则](https://en.wikipedia.org/wiki/Single-responsibility_principle)
- [Node.js 模块系统](https://nodejs.org/api/modules.html)
