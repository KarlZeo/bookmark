// 返回的函数同时携带 cancel()，用于在引擎切换或 Escape 时取消挂起的搜索
type DebouncedFunction = ((value: string) => void) & { cancel: () => void };

function debounce(fn: (value: string) => void, delay: number): DebouncedFunction {
  let timer: number | null = null;
  const debounced = (value: string) => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => {
      fn(value);
      timer = null;
    }, delay);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

module.exports = debounce;
