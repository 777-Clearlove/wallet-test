import React, { useEffect, useState } from "react";
import { createServices, type PlatformConfig } from "@repo/core/service";
import {
  defaultStorageAdapter,
  createSafeStorageAdapter,
} from "@repo/core/service-factory";
import "./App.css";

// Web 端：使用带安全增强的 localStorage
// createSafeStorageAdapter 提供：
// - 原子写入（Double Buffer + 备份）
// - Checksum 校验（CRC32）
// - 写入队列（防止并发冲突）
const safeStorageAdapter = createSafeStorageAdapter(defaultStorageAdapter);

const webPlatformConfig: PlatformConfig = {
  storageAdapter: safeStorageAdapter,
  skipHydration: false, // Web 端可以同步 hydration（安全适配器内部会处理异步）
};

// 创建 services 实例
const services = createServices(webPlatformConfig);

function App() {
  const vaults = services.vault.useStore((s) => s.vaults);
  const { add, remove } = services.vault.getState();

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

  return (
    <div className="app">
      <h1>🌐 Web Wallet</h1>
      <p className="subtitle">使用同步 localStorage</p>

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
        ✅ 数据已安全持久化到 localStorage（原子写入 + Checksum 校验）
      </p>
    </div>
  );
}

export default App;
