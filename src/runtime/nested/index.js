// 多层级嵌套书签功能
function getCollapsibleNestedContainers(root) {
  if (!root) return [];
  const headers = root.querySelectorAll(
    '.category > .category-header[data-toggle="category"], .group > .group-header[data-toggle="group"]'
  );
  return Array.from(headers)
    .map((header) => header.parentElement)
    .filter(Boolean);
}

function isNestedContainerCollapsible(container) {
  if (!container) return false;

  if (container.classList.contains('category')) {
    return Boolean(container.querySelector(':scope > .category-header[data-toggle="category"]'));
  }

  if (container.classList.contains('group')) {
    return Boolean(container.querySelector(':scope > .group-header[data-toggle="group"]'));
  }

  return false;
}

// 更新分类切换按钮图标
function updateCategoryToggleIcon(state) {
  const toggleBtn = document.getElementById('category-toggle');
  if (!toggleBtn) return;

  const icon = toggleBtn.querySelector('i');
  if (!icon) return;

  if (state === 'up') {
    icon.className = 'fas fa-angle-double-up';
    toggleBtn.setAttribute('aria-label', '收起分类');
  } else {
    icon.className = 'fas fa-angle-double-down';
    toggleBtn.setAttribute('aria-label', '展开分类');
  }
}

// 切换嵌套元素
function toggleNestedElement(container) {
  if (!isNestedContainerCollapsible(container)) return;
  const isCollapsed = container.classList.contains('collapsed');

  if (isCollapsed) {
    container.classList.remove('collapsed');
    saveToggleState(container, 'expanded');
  } else {
    container.classList.add('collapsed');
    saveToggleState(container, 'collapsed');
  }

  // 触发自定义事件
  const event = new CustomEvent('nestedToggle', {
    detail: {
      element: container,
      type: container.dataset.type,
      name: container.dataset.name,
      isCollapsed: !isCollapsed,
    },
  });
  document.dispatchEvent(event);
}

// 保存切换状态
function saveToggleState(element, state) {
  const type = element.dataset.type;
  const name = element.dataset.name;
  const level = element.dataset.level || '1';
  const key = `menav-toggle-${type}-${level}-${name}`;
  localStorage.setItem(key, state);
}

// 恢复切换状态
function restoreToggleState(element) {
  const type = element.dataset.type;
  const name = element.dataset.name;
  const level = element.dataset.level || '1';
  const key = `menav-toggle-${type}-${level}-${name}`;
  const savedState = localStorage.getItem(key);

  if (savedState === 'collapsed') {
    element.classList.add('collapsed');
  }
}

// 初始化嵌套分类
function initializeNestedCategories() {
  // 为所有可折叠元素添加切换功能
  document.querySelectorAll('[data-toggle="category"], [data-toggle="group"]').forEach((header) => {
    header.addEventListener('click', function (e) {
      e.stopPropagation();
      const container = this.parentElement;
      toggleNestedElement(container);
    });

    // 恢复保存的状态
    restoreToggleState(header.parentElement);
  });
}

// 提取嵌套数据
function extractNestedData(element) {
  const data = {
    name: element.dataset.name,
    type: element.dataset.type,
    level: element.dataset.level,
    isCollapsed: element.classList.contains('collapsed'),
  };

  // 提取子元素数据
  const subcategories = element.querySelectorAll(
    ':scope > .category-content > .subcategories-container > .category'
  );
  if (subcategories.length > 0) {
    data.subcategories = Array.from(subcategories).map((sub) => extractNestedData(sub));
  }

  const groups = element.querySelectorAll(
    ':scope > .category-content > .groups-container > .group'
  );
  if (groups.length > 0) {
    data.groups = Array.from(groups).map((group) => extractNestedData(group));
  }

  const subgroups = element.querySelectorAll(
    ':scope > .group-content > .subgroups-container > .group'
  );
  if (subgroups.length > 0) {
    data.subgroups = Array.from(subgroups).map((subgroup) => extractNestedData(subgroup));
  }

  const sites = element.querySelectorAll(
    ':scope > .category-content > .sites-grid > .site-card, :scope > .group-content > .sites-grid > .site-card'
  );
  if (sites.length > 0) {
    data.sites = Array.from(sites).map((site) => ({
      name: site.dataset.name,
      url: site.dataset.url,
      icon: site.dataset.icon,
      description: site.dataset.description,
    }));
  }

  return data;
}

function registerNestedApi() {
  if (!window.MeNav) {
    // runtime 入口会先初始化 MeNav；这里兜底避免报错
    window.MeNav = {};
  }

  window.MeNav.expandAll = function () {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
      getCollapsibleNestedContainers(activePage).forEach((element) => {
        element.classList.remove('collapsed');
        saveToggleState(element, 'expanded');
      });
    }
  };

  window.MeNav.collapseAll = function () {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
      getCollapsibleNestedContainers(activePage).forEach((element) => {
        element.classList.add('collapsed');
        saveToggleState(element, 'collapsed');
      });
    }
  };

  // 智能切换分类展开/收起状态
  window.MeNav.toggleCategories = function () {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;

    const allElements = getCollapsibleNestedContainers(activePage);
    const collapsedElements = allElements.filter((element) =>
      element.classList.contains('collapsed')
    );
    if (allElements.length === 0) return;

    // 如果收起的数量 >= 总数的一半，执行展开；否则执行收起
    if (collapsedElements.length >= allElements.length / 2) {
      window.MeNav.expandAll();
      updateCategoryToggleIcon('up');
    } else {
      window.MeNav.collapseAll();
      updateCategoryToggleIcon('down');
    }
  };

  window.MeNav.toggleCategory = function (
    categoryName,
    subcategoryName = null,
    groupName = null,
    subgroupName = null
  ) {
    let selector = `[data-name="${categoryName}"]`;

    if (subcategoryName) selector += ` [data-name="${subcategoryName}"]`;
    if (groupName) selector += ` [data-name="${groupName}"]`;
    if (subgroupName) selector += ` [data-name="${subgroupName}"]`;

    const element = document.querySelector(selector);
    if (element) {
      toggleNestedElement(element);
    }
  };

  window.MeNav.getNestedStructure = function () {
    // 返回完整的嵌套结构数据
    const categories = [];
    document.querySelectorAll('.category-level-1').forEach((cat) => {
      categories.push(extractNestedData(cat));
    });
    return categories;
  };
}

registerNestedApi();

module.exports = {
  initializeNestedCategories,
  updateCategoryToggleIcon,
  extractNestedData,
};
