// 获取所有元素
module.exports = function getAllElements(type) {
  return Array.from(document.querySelectorAll(`[data-type="${type}"]`)).map((el) => {
    const id = this._getElementId(el);
    return {
      id: id,
      type: type,
      element: el,
    };
  });
};
