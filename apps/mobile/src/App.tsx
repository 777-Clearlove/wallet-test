import React, { useEffect, useState } from "react";
import { createServices, type PlatformConfig } from "@repo/core/service";
import {
  type StorageAdapter,
  createSafeStorageAdapter,
} from "@repo/core/service-factory";
import "./App.css";

// ============ 模拟异步 AsyncStorage ============
// 类似于 React Native 的 AsyncStorage

const createAsyncLocalStorage = (): StorageAdapter => {
  // 使用 localStorage 作为底层存储，但所有操作都是异步的
  const storage = new Map<string, string>();

  // 初始化时从 localStorage 加载数据
  if (typeof window !== "undefined" && window.localStorage) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) storage.set(key, value);
      }
    }
  }

  return {
    getItem: async (key: string): Promise<string | null> => {
      // 模拟网络延迟（50-150ms）
      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 100)
      );
      return storage.get(key) ?? null;
    },

    setItem: async (key: string, value: string): Promise<void> => {
      // 模拟网络延迟
      await new Promise((resolve) =>
        setTimeout(resolve, 30 + Math.random() * 70)
      );
      storage.set(key, value);
      // 同时持久化到真实 localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(key, value);
      }
    },

    removeItem: async (key: string): Promise<void> => {
      // 模拟网络延迟
      await new Promise((resolve) =>
        setTimeout(resolve, 20 + Math.random() * 50)
      );
      storage.delete(key);
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(key);
      }
    },
  };
};

// ============ 创建 Services ============

// Mobile 端：使用异步存储（模拟 AsyncStorage）
const baseAsyncAdapter = createAsyncLocalStorage();

// 安全增强（异步适配器配置）：
// - queue: 写入队列，防止并发冲突（异步适配器必须）
// - atomic: false - 异步适配器必须禁用（会导致嵌套异步调用问题）
// - checksum: CRC32 校验，检测数据损坏
const safeAsyncAdapter = createSafeStorageAdapter(baseAsyncAdapter, {
  atomic: false, // ⚠️ 异步适配器必须禁用原子写入
});

const mobilePlatformConfig: PlatformConfig = {
  storageAdapter: safeAsyncAdapter,
  skipHydration: true, // 异步存储必须跳过自动 hydration
};

// 创建 services 实例
const services = createServices(mobilePlatformConfig);

// ============ App 组件 ============

function App() {
  const [isHydrating, setIsHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<Error | null>(null);

  const vaults = services.vault.useStore((s) => s.vaults);
  const { add, remove } = services.vault.getState();

  // 手动 hydration
  useEffect(() => {
    const hydrate = async () => {
      try {
        await services.vault.hydrate();
        setIsHydrating(false);
      } catch (error) {
        console.error("Hydration failed:", error);
        setHydrationError(
          error instanceof Error ? error : new Error("Hydration failed")
        );
        setIsHydrating(false);
      }
    };

    hydrate();
  }, []);

  const handleAddVault = () => {
    add({
      id: crypto.randomUUID(),
      version: 1,
      name: `Vault ${vaults.length + 1}`,
      type: "mnemonic",
      source: "create",
      value: "test mnemonic phrase here",
      isBackup: false,
      createdAt: new Date(),
    });
  };

  const handleRemoveVault = (id: string) => {
    remove(id);
  };

  // 加载状态
  if (isHydrating) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>正在加载钱包数据...</p>
        <p className="loading-hint">异步存储 hydration 中</p>
      </div>
    );
  }

  // 错误状态
  if (hydrationError) {
    return (
      <div className="error-state">
        <h2>❌ 加载失败</h2>
        <p>{hydrationError.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>📱 Mobile Wallet</h1>
      <p className="subtitle">使用异步 AsyncStorage（模拟）</p>

      <div className="card">
        <h2>Vaults ({vaults.length})</h2>
        <button type="button" onClick={handleAddVault}>
          + 添加 Vault
        </button>

        <ul className="vault-list">
          {vaults.map((vault) => (
            <li key={vault.id} className="vault-item">
              <div className="vault-info">
                <strong>{vault.name}</strong>
                <span className="vault-type">{vault.type}</span>
              </div>
              <button
                type="button"
                className="remove-btn"
                onClick={() => handleRemoveVault(vault.id)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>

        {vaults.length === 0 && (
          <p className="empty-state">暂无 Vault，点击上方按钮添加</p>
        )}
      </div>

      <p className="storage-info">
        ⚡ 异步安全存储（写入队列 + Checksum 校验）
      </p>
    </div>
  );
}

export default App;
