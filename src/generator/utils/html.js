// HTML 转义函数，防止 XSS 攻击
function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) {
    return '';
  }
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  escapeHtml,
};
