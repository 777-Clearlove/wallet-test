import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		// 使用 happy-dom，它提供完整的 localStorage 支持
		environment: "happy-dom",
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/service-factory/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/__tests__/**",
			],
		},
		// 设置更长的超时时间用于异步测试
		testTimeout: 10000,
		hookTimeout: 10000,
	},
});

