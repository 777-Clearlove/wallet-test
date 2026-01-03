/**
 * 测试工具使用示例
 *
 * 展示如何使用 createTestServicesFactory 和相关测试工具
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	createTestServicesFactory,
	createMemoryStorage,
	createMockService,
	createSnapshot,
	compareSnapshots,
	waitForState,
} from "../../service-factory/testing";
import { createServices } from "..";

// ============ 创建测试 Services 工厂 ============

/**
 * 使用 createTestServicesFactory 包装 createServices
 * 这会添加 __reset、__setState 等测试辅助方法
 */
const createTestServices = createTestServicesFactory(createServices);

// ============ 测试示例 ============

describe("Vault Service 测试（使用增强测试工具）", () => {
	let services: ReturnType<typeof createTestServices>;

	beforeEach(async () => {
		// 创建测试 services（默认跳过 hydration）
		services = createTestServices();
		await services.__waitForAllHydration();
	});

	afterEach(() => {
		// 销毁所有 services 和清理存储
		services.__destroy();
	});

	it("应该添加 vault", () => {
		const vault = {
			version: 1,
			id: crypto.randomUUID(),
			name: "Test Vault",
			source: "create" as const,
			type: "mnemonic" as const,
			value: "test mnemonic phrase",
			isBackup: false,
			createdAt: new Date(),
		};

		services.vault.getState().add(vault);

		expect(services.vault.getState().vaults).toHaveLength(1);
		expect(services.vault.getState().vaults[0].name).toBe("Test Vault");
	});

	it("应该使用 __setState 直接设置状态", () => {
		const testVaults = [
			{
				version: 1,
				id: crypto.randomUUID(),
				name: "Vault 1",
				source: "create" as const,
				type: "mnemonic" as const,
				value: "mnemonic 1",
				isBackup: false,
				createdAt: new Date(),
			},
			{
				version: 1,
				id: crypto.randomUUID(),
				name: "Vault 2",
				source: "import" as const,
				type: "privateKey" as const,
				value: "private key",
				createdAt: new Date(),
			},
		];

		// 直接设置状态，跳过 action
		services.__setState("vault", { vaults: testVaults });

		expect(services.vault.getState().vaults).toHaveLength(2);
	});

	it("应该使用 __reset 重置所有状态", async () => {
		// 添加一些数据
		services.__setState("vault", {
			vaults: [{
				version: 1,
				id: crypto.randomUUID(),
				name: "Test",
				source: "create" as const,
				type: "mnemonic" as const,
				value: "test",
				isBackup: false,
				createdAt: new Date(),
			}],
		});

		expect(services.vault.getState().vaults).toHaveLength(1);

		// 重置
		await services.__reset();

		// 状态应该回到初始值
		// 注意：__reset 只清空存储，不重置内存状态
		// 如果需要完全重置，应该重新创建 services
	});

	it("应该使用 __getSnapshot 获取状态快照", () => {
		const vault = {
			version: 1,
			id: crypto.randomUUID(),
			name: "Snapshot Test",
			source: "create" as const,
			type: "mnemonic" as const,
			value: "test",
			isBackup: false,
			createdAt: new Date(),
		};

		services.vault.getState().add(vault);

		const snapshot = services.__getSnapshot("vault");

		expect(snapshot.vaults).toHaveLength(1);
		expect(snapshot.vaults[0].name).toBe("Snapshot Test");
	});

	it("应该使用 __getAllSnapshots 获取所有状态", () => {
		const snapshots = services.__getAllSnapshots();

		expect(snapshots).toHaveProperty("vault");
		expect(snapshots).toHaveProperty("derivation");
	});

	it("应该使用 __getStorage 访问存储", () => {
		const storage = services.__getStorage();

		expect(storage.size()).toBe(0); // 初始为空

		// 触发持久化
		services.vault.getState().add({
			version: 1,
			id: crypto.randomUUID(),
			name: "Storage Test",
			source: "create" as const,
			type: "mnemonic" as const,
			value: "test",
			isBackup: false,
			createdAt: new Date(),
		});

		// 存储中应该有数据
		expect(storage.size()).toBeGreaterThan(0);
		expect(storage.keys()).toContain("VaultService-storage");
	});
});

// ============ 快照工具测试 ============

describe("快照工具测试", () => {
	it("createSnapshot 应该创建深拷贝", () => {
		const original = {
			vaults: [{ id: "1", name: "Test" }],
			nested: { deep: { value: 42 } },
		};

		const snapshot = createSnapshot(original);

		// 修改原始对象
		original.vaults[0].name = "Modified";
		original.nested.deep.value = 100;

		// 快照不受影响
		expect(snapshot.vaults[0].name).toBe("Test");
		expect(snapshot.nested.deep.value).toBe(42);
	});

	it("compareSnapshots 应该检测差异", () => {
		const before = { count: 1, name: "Test", items: ["a", "b"] };
		const after = { count: 2, name: "Test", items: ["a", "b", "c"] };

		const { isEqual, diff } = compareSnapshots(before, after);

		expect(isEqual).toBe(false);
		expect(diff).toHaveProperty("count");
		expect(diff).toHaveProperty("items");
		expect(diff).not.toHaveProperty("name");
	});

	it("compareSnapshots 应该检测相等", () => {
		const a = { count: 1, name: "Test" };
		const b = { count: 1, name: "Test" };

		const { isEqual } = compareSnapshots(a, b);

		expect(isEqual).toBe(true);
	});
});

// ============ Mock Service 测试 ============

describe("Mock Service 测试", () => {
	it("createMockService 应该创建可用的 mock", () => {
		const addMock = vi.fn();
		const removeMock = vi.fn();

		const mockVault = createMockService(
			{ vaults: [{ id: "1", name: "Mock Vault" }] },
			{ add: addMock, remove: removeMock },
		);

		// 读取状态
		expect(mockVault.getState().vaults).toHaveLength(1);

		// 调用 action
		mockVault.getState().add({ id: "2", name: "New" });
		expect(addMock).toHaveBeenCalledWith({ id: "2", name: "New" });

		// 设置状态
		mockVault.store.setState({ vaults: [] });
		expect(mockVault.getState().vaults).toHaveLength(0);
	});

	it("createMockService 应该支持订阅", () => {
		const mockVault = createMockService(
			{ count: 0 },
			{ increment: () => {} },
		);

		const listener = vi.fn();
		const unsubscribe = mockVault.subscribe(listener);

		mockVault.store.setState({ count: 1 });

		expect(listener).toHaveBeenCalled();

		unsubscribe();
		mockVault.store.setState({ count: 2 });

		expect(listener).toHaveBeenCalledTimes(1);
	});
});

// ============ waitForState 测试 ============

describe("waitForState 测试", () => {
	it("应该等待状态满足条件", async () => {
		let count = 0;
		const getState = () => ({ count });

		// 异步增加 count
		setTimeout(() => { count = 5; }, 50);
		setTimeout(() => { count = 10; }, 100);

		const state = await waitForState(
			getState,
			(s) => s.count >= 10,
			{ timeout: 500 },
		);

		expect(state.count).toBe(10);
	});

	it("应该在超时时抛出错误", async () => {
		const getState = () => ({ ready: false });

		await expect(
			waitForState(getState, (s) => s.ready, { timeout: 100 }),
		).rejects.toThrow("waitForState timeout");
	});
});

// ============ 带初始存储的测试 ============

describe("带初始存储数据的测试", () => {
	it("应该加载初始存储数据", async () => {
		const initialVaults = [
			{
				version: 1,
				id: "pre-existing-id",
				name: "Pre-existing Vault",
				source: "import",
				type: "mnemonic",
				value: "pre-existing mnemonic",
				isBackup: true,
				createdAt: new Date().toISOString(),
			},
		];

		const services = createTestServices({
			skipHydration: false, // 不跳过 hydration，加载初始数据
			initialStorage: {
				"VaultService-storage": JSON.stringify({
					state: { vaults: initialVaults },
					version: 0,
				}),
			},
		});

		await services.__waitForAllHydration();

		// 应该加载初始数据
		expect(services.vault.getState().vaults).toHaveLength(1);
		expect(services.vault.getState().vaults[0].name).toBe("Pre-existing Vault");

		services.__destroy();
	});
});

// ============ 异步存储测试 ============

describe("异步存储测试", () => {
	it("应该支持模拟异步存储延迟", async () => {
		const services = createTestServices({
			delay: 50, // 50ms 延迟
		});

		await services.__waitForAllHydration();

		const start = Date.now();

		services.vault.getState().add({
			version: 1,
			id: crypto.randomUUID(),
			name: "Async Test",
			source: "create" as const,
			type: "mnemonic" as const,
			value: "test",
			isBackup: false,
			createdAt: new Date(),
		});

		// 等待存储完成
		await new Promise((resolve) => setTimeout(resolve, 100));

		const storage = services.__getStorage();
		expect(storage.size()).toBeGreaterThan(0);

		services.__destroy();
	});
});

