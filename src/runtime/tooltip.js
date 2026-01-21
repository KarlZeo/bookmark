// Tooltip functionality for truncated text（仅桌面端/支持悬停设备启用）
document.addEventListener('DOMContentLoaded', () => {
  const hoverMedia = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)');

  if (!hoverMedia) {
    return;
  }

  let cleanupTooltip = null;

  function enableTooltip() {
    if (cleanupTooltip) return;

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    document.body.appendChild(tooltip);

    let activeElement = null;

    function updateTooltipPosition() {
      if (!activeElement) return;

      const rect = activeElement.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const gap = 10; // 卡片与Tooltip的间距

      // 默认显示在卡片下方
      let top = rect.bottom + gap;
      // 水平居中对齐
      let left = rect.left + (rect.width - tooltipRect.width) / 2;

      const winWidth = window.innerWidth;
      const winHeight = window.innerHeight;

      // 垂直边界检查：如果下方空间不足，尝试显示在上方
      if (top + tooltipRect.height > winHeight - gap) {
        top = rect.top - tooltipRect.height - gap;
      }

      // 水平边界检查：防止溢出屏幕左右边界
      if (left < gap) {
        left = gap;
      } else if (left + tooltipRect.width > winWidth - gap) {
        left = winWidth - tooltipRect.width - gap;
      }

      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }

    // Show tooltip on hover
    function onMouseOver(e) {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;

      const tooltipText = target.getAttribute('data-tooltip');
      if (!tooltipText) return;

      activeElement = target;
      tooltip.textContent = tooltipText;
      tooltip.classList.add('visible');
      // 先显示元素让浏览器计算尺寸，然后立即更新位置
      updateTooltipPosition();
    }

    // Hide tooltip on mouse out
    function onMouseOut(e) {
      const target = e.target.closest('[data-tooltip]');
      if (!target || target !== activeElement) return;

      // Check if we really left the element (not just went to a child)
      if (target.contains(e.relatedTarget)) return;

      activeElement = null;
      tooltip.classList.remove('visible');
    }

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);

    cleanupTooltip = () => {
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);

      activeElement = null;
      tooltip.classList.remove('visible');
      tooltip.remove();
    };
  }

  function disableTooltip() {
    if (!cleanupTooltip) return;
    cleanupTooltip();
    cleanupTooltip = null;
  }

  function syncTooltipEnabled() {
    if (hoverMedia.matches) {
      enableTooltip();
    } else {
      disableTooltip();
    }
  }

  syncTooltipEnabled();

  // 兼容旧版 Safari：addListener/removeListener
  if (hoverMedia.addEventListener) {
    hoverMedia.addEventListener('change', syncTooltipEnabled);
  } else if (hoverMedia.addListener) {
    hoverMedia.addListener(syncTooltipEnabled);
  }
});
