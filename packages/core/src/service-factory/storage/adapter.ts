/**
 * 跨端存储工具
 */

// ============ 类型定义 ============

/**
 * 跨端存储适配器接口
 * 支持 Web (localStorage)、React Native (AsyncStorage)、Electron、浏览器插件等
 */
export interface StorageAdapter {
	/**
	 * 获取存储项
	 * @param key 存储键
	 * @returns 存储的字符串值，如果不存在返回 null
	 */
	getItem(key: string): string | null | Promise<string | null>;

	/**
	 * 设置存储项
	 * @param key 存储键
	 * @param value 要存储的字符串值
	 */
	setItem(key: string, value: string): void | Promise<void>;

	/**
	 * 删除存储项
	 * @param key 存储键
	 */
	removeItem(key: string): void | Promise<void>;
}

// ============ 存储适配器 ============

/**
 * 默认的 localStorage 适配器（仅 Web 端可用）
 */
export const defaultLocalStorageAdapter: StorageAdapter = {
	getItem: (key: string) => {
		if (typeof window === "undefined" || !window.localStorage) {
			console.warn("localStorage not available, using in-memory storage");
			return null;
		}
		return localStorage.getItem(key);
	},
	setItem: (key: string, value: string) => {
		if (typeof window === "undefined" || !window.localStorage) {
			console.warn("localStorage not available, skipping setItem");
			return;
		}
		localStorage.setItem(key, value);
	},
	removeItem: (key: string) => {
		if (typeof window === "undefined" || !window.localStorage) {
			console.warn("localStorage not available, skipping removeItem");
			return;
		}
		localStorage.removeItem(key);
	},
};

