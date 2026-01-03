# 跨端存储适配器使用指南

本文档介绍如何在不同平台（Web、React Native、Electron、浏览器插件）使用钱包 Core 库的存储功能。

---

## 🎯 核心概念

**StorageAdapter** 是一个抽象接口，定义了三个方法：

```typescript
interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
```

- **同步适配器**：Web 的 localStorage/sessionStorage、Electron Store
- **异步适配器**：React Native AsyncStorage、Chrome Extension、IndexedDB

> ⚠️ **重要**：使用异步适配器时，必须设置 `skipHydration: true` 并手动调用 `hydrate()`

---

## 📦 各平台使用指南

### 1️⃣ Web 平台 - localStorage

**默认配置**（无需显式指定）：

```typescript
import { createStoreFactory } from '@repo/core/utils/serviceUtil';
import { VaultsStateSchema } from './schema';

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  // 默认使用 localStorage，无需配置 storageAdapter
});

const { store, useStore } = createStore(initialState, { actions });
```

**显式使用 sessionStorage**：

```typescript
import { sessionStorageAdapter } from '@repo/core/adapters/storageAdapters';

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: sessionStorageAdapter, // 会话级存储
});
```

---

### 2️⃣ React Native - AsyncStorage

**安装依赖**：

```bash
npm install @react-native-async-storage/async-storage
```

**配置 Store**：

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStorageAdapter } from '@repo/core/adapters/storageAdapters';

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: createAsyncStorageAdapter(AsyncStorage),
  skipHydration: true, // ⚠️ 必须！AsyncStorage 是异步的
});

const vaultService = createStore(initialState, { actions });
```

**在应用启动时手动 hydrate**：

```typescript
// App.tsx
import { useEffect, useState } from 'react';

function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      // 等待所有 store hydration 完成
      await vaultService.hydrate();
      await networkService.hydrate();

      setIsReady(true);
    }

    prepare();
  }, []);

  if (!isReady) {
    return <SplashScreen />;
  }

  return <MainApp />;
}
```

**监听 hydration 状态**：

```typescript
// 使用 RxJS Observable
vaultService.hydrationState$.subscribe((state) => {
  console.log('Hydration:', state.hasHydrated);
  if (state.usedFallback) {
    console.warn('使用了降级数据');
  }
});

// 或使用回调
const unsubscribe = vaultService.onHydrationChange((state) => {
  if (state.hydrationError) {
    console.error('Hydration failed:', state.hydrationError);
  }
});
```

---

### 3️⃣ Electron - electron-store

**安装依赖**：

```bash
npm install electron-store
```

**配置 Store（支持加密）**：

```typescript
import ElectronStore from 'electron-store';
import { createElectronStoreAdapter } from '@repo/core/adapters/storageAdapters';

const electronStore = new ElectronStore({
  name: 'wallet-config',
  encryptionKey: process.env.ENCRYPTION_KEY, // 可选：加密存储
  cwd: app.getPath('userData'), // 存储路径
});

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: createElectronStoreAdapter(electronStore),
});
```

**在主进程和渲染进程之间共享**：

```typescript
// main.ts
import { ipcMain } from 'electron';

ipcMain.handle('store:get-state', () => {
  return vaultService.getState();
});

// renderer.ts
const state = await window.electron.ipcRenderer.invoke('store:get-state');
```

---

### 4️⃣ 浏览器插件 - Chrome Extension

**Manifest V3 配置**：

```json
{
  "permissions": ["storage"],
  "host_permissions": ["<all_urls>"]
}
```

**使用 chrome.storage.local**：

```typescript
import { createChromeStorageAdapter } from '@repo/core/adapters/storageAdapters';

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: createChromeStorageAdapter('local'), // 或 'sync'
  skipHydration: true, // ⚠️ 必须！chrome.storage 是异步的
});

const vaultService = createStore(initialState, { actions });

// 在插件启动时 hydrate
chrome.runtime.onStartup.addListener(async () => {
  await vaultService.hydrate();
  console.log('Store ready');
});
```

**跨标签页同步**（使用 sync storage）：

```typescript
const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: createChromeStorageAdapter('sync'), // 跨设备同步
  skipHydration: true,
});
```

**监听其他标签页的变更**：

```typescript
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes['VaultsStore-storage']) {
    // 手动触发 rehydration
    vaultService.hydrate();
  }
});
```

---

### 5️⃣ IndexedDB（大量数据存储）

**适用场景**：
- 需要存储 > 10MB 数据
- 交易历史、NFT 元数据等大量数据

```typescript
import { createIndexedDBAdapter } from '@repo/core/adapters/storageAdapters';

const createStore = createStoreFactory({
  name: 'TransactionStore',
  schema: TransactionSchema,
  storageAdapter: createIndexedDBAdapter('wallet-db', 'transactions'),
  skipHydration: true,
});

const txService = createStore({ transactions: [] }, { actions });
await txService.hydrate();
```

---

### 6️⃣ 加密存储（所有平台通用）

**使用 CryptoJS 加密**：

```bash
npm install crypto-js
```

```typescript
import CryptoJS from 'crypto-js';
import {
  localStorageAdapter,
  createEncryptedStorageAdapter
} from '@repo/core/adapters/storageAdapters';

const encryptedAdapter = createEncryptedStorageAdapter(
  localStorageAdapter,
  {
    encrypt: (data) =>
      CryptoJS.AES.encrypt(data, 'your-secret-key').toString(),
    decrypt: (data) =>
      CryptoJS.AES.decrypt(data, 'your-secret-key').toString(CryptoJS.enc.Utf8),
  }
);

const createStore = createStoreFactory({
  name: 'SecureVaultStore',
  schema: VaultsStateSchema,
  storageAdapter: encryptedAdapter, // 自动加密/解密
});
```

---

## 🧪 测试环境 - 内存存储

```typescript
import { createMemoryStorageAdapter } from '@repo/core/adapters/storageAdapters';

// 单元测试
describe('VaultService', () => {
  it('should add vault', () => {
    const createStore = createStoreFactory({
      name: 'TestStore',
      schema: VaultsStateSchema,
      storageAdapter: createMemoryStorageAdapter(), // 不会污染真实存储
    });

    const { store } = createStore({ vaults: [] }, { actions });
    store.getState().add(mockVault);

    expect(store.getState().vaults).toHaveLength(1);
  });
});
```

---

## 🔄 数据迁移（跨版本）

```typescript
const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  version: 2, // 增加版本号
  migrate: (persistedState, version) => {
    // 从 v1 迁移到 v2
    if (version === 1) {
      return {
        ...persistedState,
        vaults: persistedState.vaults.map((v) => ({
          ...v,
          version: 2, // 添加新字段
        })),
      };
    }
    return persistedState;
  },
});
```

---

## ⚙️ 高级配置

### 自定义验证失败策略

```typescript
const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  onValidationFail: 'merge', // 'reset' | 'keep' | 'merge'

  // 监听 hydration 回调
  onRehydrateStorage: (state) => {
    console.log('Rehydrating:', state);

    return (rehydratedState, error) => {
      if (error) {
        console.error('Hydration error:', error);
        // 上报到监控系统
      }
    };
  },
});
```

### 部分持久化（仅保存部分字段）

```typescript
const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema.pick({ vaults: true }), // 仅校验 vaults
  partialize: (state) => ({ vaults: state.vaults }), // 仅保存 vaults
});
```

---

## 📊 平台对比表

| 平台             | 适配器类型 | 是否异步 | 容量限制      | 加密支持    |
|------------------|------------|----------|---------------|-------------|
| Web (localStorage) | 同步       | ❌        | ~5-10MB       | ✅ 装饰器    |
| React Native      | 异步       | ✅        | 无限制        | ✅ 装饰器    |
| Electron          | 同步       | ❌        | 无限制        | ✅ 内置      |
| Chrome Extension  | 异步       | ✅        | sync: 100KB<br>local: 5MB | ❌ |
| IndexedDB         | 异步       | ✅        | ~50MB+        | ✅ 装饰器    |

---

## 🚨 常见问题

### Q1: 为什么异步适配器需要 `skipHydration: true`？

**A**: Zustand 的 persist middleware 不支持异步 `getItem`。设置 `skipHydration: true` 后，需要手动调用 `hydrate()` 来触发异步加载。

### Q2: React Native 首次加载时数据为空？

**A**: 这是正常的。在 `hydrate()` 完成前，store 使用 `initialState`。推荐在 App 启动时等待 hydration：

```typescript
const [isReady, setIsReady] = useState(false);

useEffect(() => {
  Promise.all([
    vaultService.hydrate(),
    networkService.hydrate(),
  ]).then(() => setIsReady(true));
}, []);
```

### Q3: 如何检测降级数据（validation 失败后的 merge）？

**A**: 使用 `usedFallback()` 或监听 `hydrationState$`：

```typescript
if (vaultService.usedFallback()) {
  console.warn('数据已损坏，使用了合并策略');
  // 显示警告给用户
}
```

### Q4: 跨平台项目如何动态选择适配器？

**A**: 使用环境变量或平台检测：

```typescript
import { Platform } from 'react-native';

function getStorageAdapter(): StorageAdapter {
  if (Platform.OS === 'web') {
    return localStorageAdapter;
  }
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return createAsyncStorageAdapter(AsyncStorage);
  }
  // Electron
  return createElectronStoreAdapter(electronStore);
}

const createStore = createStoreFactory({
  name: 'VaultsStore',
  storageAdapter: getStorageAdapter(),
  skipHydration: Platform.OS !== 'web', // Web 端同步，其他端异步
});
```

---

## 📝 总结

1. **Web 开发**：直接使用默认配置（localStorage）
2. **RN/插件**：必须使用异步适配器 + `skipHydration: true` + 手动 `hydrate()`
3. **Electron**：使用 electron-store 获得原生加密和更好的性能
4. **敏感数据**：使用 `createEncryptedStorageAdapter` 包装任何适配器
5. **测试**：使用 `createMemoryStorageAdapter` 避免污染存储

需要帮助？查看 [示例代码](../service/Vault/index.ts) 或提交 Issue。
