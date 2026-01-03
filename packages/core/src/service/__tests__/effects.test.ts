/**
 * Derivation Effects 测试
 * 测试 Vault 变化时自动管理 Derivation 的功能
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServices } from "../index";
import type { Vault } from "../Vault";
import type { Derivation } from "../Derivation";

// 内存存储适配器
function createMemoryStorageAdapter() {
	const storage = new Map<string, string>();
	return {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value),
		removeItem: (key: string) => storage.delete(key),
	};
}

describe("Derivation Effects", () => {
	let services: ReturnType<typeof createServices>;

	beforeEach(() => {
		services = createServices({
			storageAdapter: createMemoryStorageAdapter(),
			skipHydration: true,
		});
	});

	afterEach(() => {
		services.destroy();
	});

	describe("Vault 新增时自动创建 Derivation", () => {
		it("新增 mnemonic 类型 Vault 时，应该自动创建对应的 Derivation", () => {
			const { vault, derivation } = services;

			// 初始状态：无 derivation
			expect(derivation.getState().derivations).toHaveLength(0);

			// 新增 mnemonic vault
			const newVault: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Test Wallet",
				type: "mnemonic",
				source: "create",
				value: "test mnemonic phrase",
				isBackup: false,
				createdAt: new Date(),
			};

			vault.getState().add(newVault);

			// 应该自动创建一个 derivation
			const derivations = derivation.getState().derivations;
			expect(derivations).toHaveLength(1);
			expect(derivations[0]!.vaultId).toBe(newVault.id);
			expect(derivations[0]!.hdIndex).toBe(0);
			expect(derivations[0]!.name).toBe("Account 1");
			expect(derivations[0]!.hidden).toBe(false);
		});

		it("新增 privateKey 类型 Vault 时，不应该自动创建 Derivation", () => {
			const { vault, derivation } = services;

			const newVault: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Private Key Wallet",
				type: "privateKey",
				source: "import",
				value: "0x1234567890",
				createdAt: new Date(),
			};

			vault.getState().add(newVault);

			// 不应该创建 derivation
			expect(derivation.getState().derivations).toHaveLength(0);
		});

		it("新增 public 类型 Vault 时，不应该自动创建 Derivation", () => {
			const { vault, derivation } = services;

			const newVault: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Watch-only Wallet",
				type: "public",
				source: "import",
				createdAt: new Date(),
			};

			vault.getState().add(newVault);

			expect(derivation.getState().derivations).toHaveLength(0);
		});

		it("新增多个 mnemonic Vault 时，应该为每个创建对应的 Derivation", () => {
			const { vault, derivation } = services;

			const vault1: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Wallet 1",
				type: "mnemonic",
				source: "create",
				value: "mnemonic 1",
				isBackup: false,
				createdAt: new Date(),
			};

			const vault2: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Wallet 2",
				type: "mnemonic",
				source: "import",
				value: "mnemonic 2",
				isBackup: true,
				createdAt: new Date(),
			};

			vault.getState().add(vault1);
			vault.getState().add(vault2);

			const derivations = derivation.getState().derivations;
			expect(derivations).toHaveLength(2);

			const derivationVaultIds = derivations.map((d) => d.vaultId);
			expect(derivationVaultIds).toContain(vault1.id);
			expect(derivationVaultIds).toContain(vault2.id);
		});
	});

	describe("Vault 删除时自动删除 Derivation", () => {
		it("删除 Vault 时，应该自动删除该 Vault 下的所有 Derivation", () => {
			const { vault, derivation } = services;

			// 先添加一个 vault 和它的 derivation
			const newVault: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Test Wallet",
				type: "mnemonic",
				source: "create",
				value: "test mnemonic",
				isBackup: false,
				createdAt: new Date(),
			};

			vault.getState().add(newVault);
			expect(derivation.getState().derivations).toHaveLength(1);

			// 删除 vault
			vault.getState().remove(newVault.id);

			// derivation 也应该被删除
			expect(derivation.getState().derivations).toHaveLength(0);
		});

		it("删除 Vault 时，只删除该 Vault 的 Derivation，不影响其他 Vault 的 Derivation", () => {
			const { vault, derivation } = services;

			const vault1: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Wallet 1",
				type: "mnemonic",
				source: "create",
				value: "mnemonic 1",
				isBackup: false,
				createdAt: new Date(),
			};

			const vault2: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Wallet 2",
				type: "mnemonic",
				source: "create",
				value: "mnemonic 2",
				isBackup: false,
				createdAt: new Date(),
			};

			vault.getState().add(vault1);
			vault.getState().add(vault2);

			expect(derivation.getState().derivations).toHaveLength(2);

			// 删除 vault1
			vault.getState().remove(vault1.id);

			// 只剩下 vault2 的 derivation
			const remaining = derivation.getState().derivations;
			expect(remaining).toHaveLength(1);
			expect(remaining[0]!.vaultId).toBe(vault2.id);
		});

		it("删除 Vault 时，应该删除该 Vault 下所有手动添加的 Derivation", () => {
			const { vault, derivation } = services;

			const newVault: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Test Wallet",
				type: "mnemonic",
				source: "create",
				value: "test mnemonic",
				isBackup: false,
				createdAt: new Date(),
			};

			vault.getState().add(newVault);

			// 手动添加更多 derivation
			const extraDerivation: Derivation = {
				version: 1,
				id: crypto.randomUUID(),
				hdIndex: 1,
				name: "Account 2",
				hidden: false,
				vaultId: newVault.id,
			};
			derivation.getState().add(extraDerivation);

			expect(derivation.getState().derivations).toHaveLength(2);

			// 删除 vault
			vault.getState().remove(newVault.id);

			// 所有相关的 derivation 都应该被删除
			expect(derivation.getState().derivations).toHaveLength(0);
		});
	});

	describe("destroy 清理", () => {
		it("destroy 后 effects 不应该继续响应", () => {
			const { vault, derivation, destroy } = services;

			// 销毁 services
			destroy();

			// 再次添加 vault（不应该触发 effect）
			const newVault: Vault = {
				version: 1,
				id: crypto.randomUUID(),
				name: "Test Wallet",
				type: "mnemonic",
				source: "create",
				value: "test mnemonic",
				isBackup: false,
				createdAt: new Date(),
			};

			vault.getState().add(newVault);

			// 由于 effects 已清理，不应该自动创建 derivation
			expect(derivation.getState().derivations).toHaveLength(0);
		});
	});
});

