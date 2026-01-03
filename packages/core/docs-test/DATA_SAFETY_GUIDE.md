# 🔒 数据安全最佳实践指南

## 📋 目录

1. [快速开始](#快速开始)
2. [问题与解决方案](#问题与解决方案)
3. [推荐配置](#推荐配置)
4. [各端最佳实践](#各端最佳实践)
5. [性能优化](#性能优化)

---

## 🚀 快速开始

### 基础配置（Web 端）

```typescript
import {
  createStoreFactory,
  createSafeStorageAdapter,
  defaultStorageAdapter,
} from '@repo/core/store';

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,

  // ✅ 使用安全适配器（推荐生产环境）
  storageAdapter: createSafeStorageAdapter(defaultStorageAdapter),
});
```

**就这么简单！**`createSafeStorageAdapter` 自动包含：
- ✅ 原子写入（防止写入中断导致数据损坏）
- ✅ Checksum 校验（检测数据损坏并自动恢复）
- ✅ 版本控制（防止旧数据覆盖新数据）

---

## 🔍 问题与解决方案

### 问题 1：写入中断导致数据损坏

**场景**：
- 用户添加 100 个 vault，写入过程中浏览器崩溃
- `JSON.stringify` 处理大对象时内存溢出
- 磁盘空间不足，`localStorage.setItem` 失败

**风险**：**用户数据永久丢失** 🔴

**解决方案**：原子写入（Double Buffer）

```typescript
import { createAtomicStorageAdapter } from '@repo/core/store';

const safeAdapter = createAtomicStorageAdapter(localStorageAdapter);
```

**工作原理**：
1. 写入到临时 key（`store.tmp`）
2. 备份当前数据（`store.bak`）
3. 验证写入成功
4. 原子性替换主数据
5. 清理临时文件

**效果**：即使崩溃，旧数据仍完整保留 ✅

---

### 问题 2：数据损坏检测与恢复

**场景**：
- 系统写入到一半崩溃，JSON 格式损坏
- 磁盘错误导致数据截断
- 用户手动编辑 localStorage（开发者工具）

**风险**：应用启动时报错，无法恢复 🔴

**解决方案**：Checksum 校验

```typescript
import { createChecksumStorageAdapter } from '@repo/core/store';

const safeAdapter = createChecksumStorageAdapter(
  createAtomicStorageAdapter(localStorageAdapter)
);
```

**工作原理**：
1. 写入时计算 CRC32 校验和
2. 读取时验证校验和
3. 损坏时自动从 `.bak` 备份恢复

**效果**：检测任何数据损坏，自动恢复 ✅

---

### 问题 3：并发 Action 导致状态覆盖

**场景**：
```typescript
// 两个异步 action 同时执行
Promise.all([
  vaultService.store.getState().fetchAndAdd('vault-1'),
  vaultService.store.getState().fetchAndAdd('vault-2'),
]);

// ❌ 可能只添加一个 vault（后写入的覆盖先写入的）
```

**解决方案 A**：避免并发调用（应用层）
```typescript
// ✅ 顺序执行
await vaultService.store.getState().fetchAndAdd('vault-1');
await vaultService.store.getState().fetchAndAdd('vault-2');

// 或批量操作
await vaultService.store.getState().batchFetchAndAdd(['vault-1', 'vault-2']);
```

**解决方案 B**：使用 Zustand 的 `set` 保证原子性
```typescript
// action.ts
fetchAndAdd: async (id: string) => {
  const response = await fetch(`/api/vaults/${id}`);
  const data = await response.json();
  const vault = VaultSchema.parse(data);

  // ✅ set() 是原子操作，不会被其他 action 中断
  set((draft) => {
    if (!draft.vaults.some(v => v.id === id)) {
      draft.vaults.push(vault);
    }
  });
}
```

**Zustand 保证**：
- 每次 `set()` 调用是原子的（基于 Immer produce）
- 但多个 `await` 之间可能被其他 action 插入

---

### 问题 4：频繁写入影响性能

**场景**：
```typescript
// 循环添加 1000 个 vault
for (let i = 0; i < 1000; i++) {
  vaultService.store.getState().add(vaults[i]);
  // ❌ 每次都写入 localStorage，非常慢
}
```

**解决方案 A**：批量操作（推荐）
```typescript
// ✅ 一次性添加
vaultService.store.getState().batchAdd(vaults);

// action.ts
batchAdd: (vaults: Vault[]) => {
  set((draft) => {
    draft.vaults.push(...vaults);
  });
  // 只触发一次 localStorage 写入
}
```

**解决方案 B**：防抖写入（可选）
```typescript
import { createDebouncedStorageAdapter } from '@repo/core/store';

const debouncedAdapter = createDebouncedStorageAdapter(
  localStorageAdapter,
  300, // 延迟 300ms 写入
  { maxWait: 1000 } // 最多延迟 1s
);
```

**工作原理**：
- 延迟写入，减少写入频率
- 监听 `beforeunload`，页面关闭前强制写入

**注意**：⚠️ 如果崩溃，最后 300ms 的数据可能丢失

---

### 问题 5：跨标签页数据不同步

**场景**：
- 用户打开两个标签页
- 标签页 A 添加 vault-1
- 标签页 B 不知道 vault-1 存在

**解决方案**（Web 端）：

```typescript
const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  enableCrossTabSync: true, // ✅ 启用跨标签页同步
});
```

**工作原理**：
- 监听 `storage` 事件
- 其他标签页修改数据时，自动 `rehydrate()`

**插件端不需要**：
- Background Script 统一写入
- Content Scripts/Popup 只负责读取和发消息
- 避免了多处并发写入

---

## 🎯 推荐配置

### 生产环境（钱包核心数据）

```typescript
import {
  createStoreFactory,
  createSafeStorageAdapter,
  defaultStorageAdapter,
} from '@repo/core/store';

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,

  // ✅ 全功能安全适配器
  storageAdapter: createSafeStorageAdapter(defaultStorageAdapter),

  // ✅ 数据损坏时使用 merge 策略（尽量保留数据）
  onValidationFail: 'merge',

  // 🚫 跨标签页同步（Web 端可选，插件端不需要）
  enableCrossTabSync: false,
});
```

**包含的功能**：
1. ✅ 原子写入（Double Buffer + 备份）
2. ✅ Checksum 校验（CRC32）
3. ✅ 版本控制（防止旧数据覆盖）

---

### 开发环境

```typescript
const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  // 不使用安全适配器，便于调试
  storageAdapter: defaultStorageAdapter,
  enableDevtools: true,
});
```

---

### 高性能场景（编辑器、Canvas 等）

```typescript
import {
  createDebouncedStorageAdapter,
  createAtomicStorageAdapter,
} from '@repo/core/store';

// 防抖 + 原子写入
const adapter = createDebouncedStorageAdapter(
  createAtomicStorageAdapter(localStorageAdapter),
  500, // 延迟 500ms
  { maxWait: 2000 } // 最多延迟 2s
);

const createStore = createStoreFactory({
  name: 'EditorStore',
  storageAdapter: adapter,
});
```

---

## 📱 各端最佳实践

### Web 端

```typescript
import {
  createStoreFactory,
  createSafeStorageAdapter,
  defaultStorageAdapter,
} from '@repo/core/store';

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: createSafeStorageAdapter(defaultStorageAdapter),
  enableCrossTabSync: true, // 可选
});
```

---

### React Native

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAsyncStorageAdapter,
  createSafeStorageAdapter,
} from '@repo/core/adapters/storageAdapters';

// ⚠️ 异步适配器不能直接用 createSafeStorageAdapter
// 原因：需要同步的 getItem（Zustand persist 限制）

const adapter = createAsyncStorageAdapter(AsyncStorage);

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: adapter,
  skipHydration: true, // ⚠️ 必须
});

// 应用启动时手动 hydrate
await vaultService.hydrate();
```

**RN 端的数据安全**：
- ✅ AsyncStorage 本身有 SQLite 支持（较安全）
- ✅ Schema 校验在读取时仍生效
- ⚠️ 无法使用原子写入（异步限制）
- ✅ 推荐在应用层实现备份机制

---

### Electron

```typescript
import ElectronStore from 'electron-store';
import {
  createElectronStoreAdapter,
  createSafeStorageAdapter,
} from '@repo/core/adapters/storageAdapters';

const electronStore = new ElectronStore({
  name: 'wallet-config',
  encryptionKey: process.env.ENCRYPTION_KEY, // ✅ 原生加密
});

const adapter = createSafeStorageAdapter(
  createElectronStoreAdapter(electronStore)
);

const createStore = createStoreFactory({
  name: 'VaultsStore',
  storageAdapter: adapter,
});
```

**Electron 优势**：
- ✅ `electron-store` 原生支持加密
- ✅ 基于文件系统，更可靠
- ✅ 支持原子写入

---

### 浏览器插件（Chrome Extension）

**架构设计**（推荐）：

```
┌─────────────────────────────────────────┐
│         Background Script               │
│  (唯一的写入点)                          │
│  ┌───────────────────────────────────┐  │
│  │  vaultService.store.getState()   │  │
│  │    .add(vault)                   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
              │
              │ chrome.storage.local
              ▼
     ┌──────────────────┐
     │   Persistent     │
     │   Storage        │
     └──────────────────┘
              │
              │ chrome.runtime.sendMessage
              ▼
┌─────────────────────────────────────────┐
│    Content Script / Popup               │
│  (只读 + 发送消息)                       │
│  ┌───────────────────────────────────┐  │
│  │  const vaults = await chrome     │  │
│  │    .runtime.sendMessage({        │  │
│  │      action: 'getVaults'         │  │
│  │    });                           │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Background Script**：

```typescript
import { createChromeStorageAdapter } from '@repo/core/adapters/storageAdapters';
import { createSafeStorageAdapter } from '@repo/core/store';

const adapter = createSafeStorageAdapter(
  createChromeStorageAdapter('local')
);

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: adapter,
  skipHydration: true,
});

const vaultService = createStore({ vaults: [] }, { actions });

// 启动时 hydrate
chrome.runtime.onStartup.addListener(async () => {
  await vaultService.hydrate();
});

// 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getVaults') {
    sendResponse(vaultService.getState().vaults);
  }

  if (request.action === 'addVault') {
    vaultService.getState().add(request.vault);
    sendResponse({ success: true });
  }
});
```

**Content Script / Popup**：

```typescript
// ✅ 只读取数据
const vaults = await chrome.runtime.sendMessage({ action: 'getVaults' });

// ✅ 写入请求发送到 Background
await chrome.runtime.sendMessage({
  action: 'addVault',
  vault: newVault,
});
```

**优势**：
- ✅ 单一写入点，避免并发竞态
- ✅ Background Script 生命周期长，不易崩溃
- ✅ 可以使用安全适配器

---

## ⚡ 性能优化

### 1. 批量操作

```typescript
// ❌ 不好
for (const vault of vaults) {
  vaultService.store.getState().add(vault); // 每次都写入
}

// ✅ 好
vaultService.store.getState().batchAdd(vaults); // 一次写入
```

### 2. 防抖写入

```typescript
const adapter = createDebouncedStorageAdapter(
  createAtomicStorageAdapter(localStorageAdapter),
  300,
  { maxWait: 1000 }
);
```

### 3. 部分持久化

```typescript
const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema.pick({ vaults: true }),
  partialize: (state) => ({ vaults: state.vaults }), // 只保存 vaults
});
```

### 4. IndexedDB（大数据）

```typescript
import { createIndexedDBAdapter } from '@repo/core/adapters/storageAdapters';

const adapter = createIndexedDBAdapter('wallet-db', 'vaults');

const createStore = createStoreFactory({
  name: 'VaultsStore',
  storageAdapter: adapter,
  skipHydration: true, // IndexedDB 是异步的
});

await vaultService.hydrate();
```

---

## 🧪 测试环境

```typescript
import { createMemoryStorageAdapter } from '@repo/core/adapters/storageAdapters';

describe('VaultService', () => {
  it('should add vault', () => {
    const createStore = createStoreFactory({
      name: 'TestStore',
      storageAdapter: createMemoryStorageAdapter(), // 不污染真实存储
    });

    const { store } = createStore({ vaults: [] }, { actions });
    store.getState().add(mockVault);

    expect(store.getState().vaults).toHaveLength(1);
  });
});
```

---

## 📊 功能对比表

| 适配器                     | 防损坏 | 自动恢复 | 防抖 | 版本控制 | 性能 | 推荐度 |
|----------------------------|--------|----------|------|----------|------|--------|
| `defaultStorageAdapter`    | ❌     | ❌       | ❌   | ❌       | ⭐⭐⭐ | 开发   |
| `createAtomicStorageAdapter` | ✅   | ✅       | ❌   | ❌       | ⭐⭐⭐ | ⭐⭐⭐  |
| `createChecksumStorageAdapter` | ✅ | ✅       | ❌   | ❌       | ⭐⭐  | ⭐⭐   |
| `createDebouncedStorageAdapter` | ❌ | ❌      | ✅   | ❌       | ⭐⭐⭐ | 高频写入 |
| `createVersionedStorageAdapter` | ❌ | ❌      | ❌   | ✅       | ⭐⭐⭐ | 多标签页 |
| **`createSafeStorageAdapter`** | ✅ | ✅     | 可选  | ✅       | ⭐⭐  | **⭐⭐⭐** |

---

## 🚨 常见陷阱

### ❌ 错误 1：异步适配器未设置 skipHydration

```typescript
// ❌ 错误
const createStore = createStoreFactory({
  storageAdapter: createAsyncStorageAdapter(AsyncStorage),
  // 缺少 skipHydration: true
});
// 结果：启动时报错 "Async storage adapters not supported"
```

### ❌ 错误 2：并发异步 Action

```typescript
// ❌ 错误
Promise.all([
  vaultService.store.getState().fetchAndAdd('1'),
  vaultService.store.getState().fetchAndAdd('2'),
]);
// 结果：可能只添加一个
```

### ❌ 错误 3：防抖写入未处理 beforeunload

```typescript
// ❌ 错误（自己实现防抖）
const debounced = debounce((key, value) => {
  localStorage.setItem(key, value);
}, 300);
// 结果：用户关闭页面时，最后 300ms 的数据丢失

// ✅ 正确（使用 createDebouncedStorageAdapter）
// 自动监听 beforeunload 强制写入
```

---

## 📚 延伸阅读

- [跨端存储适配器指南](./STORAGE_ADAPTERS.md)
- [数据安全性分析](./DATA_SAFETY_ANALYSIS.md)
- [重构总结](../REFACTORING_SUMMARY.md)

---

## 🎯 总结

**最小安全配置**（推荐所有生产环境）：

```typescript
import { createStoreFactory, createSafeStorageAdapter } from '@repo/core/store';

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: createSafeStorageAdapter(defaultStorageAdapter),
  onValidationFail: 'merge',
});
```

**就这么简单！** 🎉

需要帮助？提交 Issue 或查看示例代码。
