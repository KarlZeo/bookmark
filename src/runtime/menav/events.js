module.exports = function createMenavEvents() {
  return {
    listeners: {},

    // 添加事件监听器
    on: function (event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
      return this;
    },

    // 触发事件
    emit: function (event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach((callback) => callback(data));
      }
      return this;
    },

    // 移除事件监听器
    off: function (event, callback) {
      if (this.listeners[event]) {
        if (callback) {
          this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
        } else {
          delete this.listeners[event];
        }
      }
      return this;
    },
  };
};
