# 🏦 钱包数据安全最佳实践

## 从 MetaMask 和 Rainbow Wallet 学到的经验

---

## 1️⃣ RN/Electron 的写入原子性问题

### 误区：单进程 = 没有并发问题？❌

虽然 RN 和 Electron 是单 JS 线程，但**仍然存在写入原子性问题**：

#### **RN (AsyncStorage) 的问题**

**底层实现**：
- Android: SQLite
- iOS: 文件系统

**风险场景**：
```typescript
// ❌ 问题代码
await Promise.all([
  AsyncStorage.setItem('vault-1', JSON.stringify(vault1)),
  AsyncStorage.setItem('vault-2', JSON.stringify(vault2)),
  AsyncStorage.setItem('vault-3', JSON.stringify(vault3)),
]);

// 问题：
// 1. setItem 是异步的，完成顺序不确定
// 2. 如果 vault-2 写入失败，vault-1 和 vault-3 仍会写入（部分成功）
// 3. 崩溃时可能只写入一部分
```

**Android SQLite 的问题**：
- `INSERT` 语句不是事务性的（除非显式开启事务）
- 多个 `setItem` 并发时，可能交错执行
- 数据库文件损坏时，整个 AsyncStorage 不可用

**解决方案**：

```typescript
// ✅ 方案 1：顺序写入
for (const vault of vaults) {
  await AsyncStorage.setItem(`vault-${vault.id}`, JSON.stringify(vault));
}

// ✅ 方案 2：批量操作（推荐）
await AsyncStorage.multiSet(
  vaults.map(v => [`vault-${v.id}`, JSON.stringify(v)])
);

// ✅ 方案 3：单一 key 存储所有数据（我们的方案）
await AsyncStorage.setItem('vaults-store', JSON.stringify({ vaults }));
```

---

#### **Electron 的问题**

**文件系统写入不是原子的**：
```javascript
// ❌ 问题代码
fs.writeFileSync('store.json', JSON.stringify(data));

// 风险：
// 1. 如果数据很大，写入过程中崩溃会导致文件截断
// 2. 如果磁盘满了，可能写入部分数据
// 3. 旧文件已被清空，新数据未完全写入
```

**解决方案**：`electron-store` 的实现（类似我们的 AtomicStorage）

```javascript
// electron-store 内部实现（简化版）
function writeFileAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.backup`;

  // 1. 备份当前文件
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath);
  }

  // 2. 写入到临时文件
  fs.writeFileSync(tempPath, data);

  // 3. 原子性重命名（POSIX 保证原子性）
  fs.renameSync(tempPath, filePath);

  // 4. 清理备份（可选）
  fs.unlinkSync(backupPath);
}
```

**`fs.renameSync` 的原子性保证**：
- POSIX 系统（macOS/Linux）：`rename()` 系统调用是原子的
- Windows：`MoveFileEx` 不完全原子，但 Node.js 做了处理

---

## 2️⃣ MetaMask 的实现

### MetaMask Extension 架构

```
┌─────────────────────────────────────────────┐
│         Background Script                   │
│  (Service Worker in Manifest V3)            │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  redux-persist                         │ │
│  │   ├─ State Controller                 │ │
│  │   ├─ KeyringController (加密)         │ │
│  │   └─ TransactionController            │ │
│  └────────────────────────────────────────┘ │
│             │                                │
│             ▼                                │
│  ┌────────────────────────────────────────┐ │
│  │  LocalStore (Browser Storage API)     │ │
│  │   - chrome.storage.local              │ │
│  │   - Write Queue (顺序写入)            │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 核心机制

#### 1. **写入队列（Write Queue）**

MetaMask 使用 `await-semaphore` 实现写入队列：

```typescript
// 简化版实现
import { Mutex } from 'await-semaphore';

class LocalStore {
  private mutex = new Mutex();

  async setItem(key: string, value: string) {
    // 获取互斥锁，确保顺序写入
    const release = await this.mutex.acquire();
    try {
      await chrome.storage.local.set({ [key]: value });
    } finally {
      release(); // 释放锁
    }
  }
}
```

**效果**：
- ✅ 所有写入操作排队执行
- ✅ 避免并发写入导致的数据覆盖
- ✅ 即使多个 action 同时触发，也能保证数据一致性

---

#### 2. **状态分片（State Partitioning）**

MetaMask 不是把整个 state 存在一个 key，而是分片存储：

```typescript
// 分片存储
{
  'KeyringController': { /* 密钥相关 */ },
  'TransactionController': { /* 交易相关 */ },
  'PreferencesController': { /* 用户偏好 */ },
}

// 好处：
// ✅ 减少单次写入的数据量
// ✅ 降低 JSON.stringify 崩溃风险
// ✅ 不同模块互不影响
```

---

#### 3. **加密存储**

MetaMask 使用 `@metamask/browser-passworder`：

```typescript
import { encrypt, decrypt } from '@metamask/browser-passworder';

// 加密写入
const encrypted = await encrypt(password, data);
await chrome.storage.local.set({ vault: encrypted });

// 解密读取
const encrypted = await chrome.storage.local.get('vault');
const decrypted = await decrypt(password, encrypted.vault);
```

**核心算法**：
- **加密**：AES-GCM（PBKDF2 派生密钥）
- **盐值**：随机生成，存储在密文中
- **校验**：GCM 自带认证标签（AEAD）

---

#### 4. **数据迁移（Migration）**

```typescript
// MetaMask 的 migrator.ts
const migrations = {
  0: (state) => state,
  1: (state) => ({ ...state, version: 1 }),
  2: (state) => {
    // 添加新字段
    return { ...state, newField: defaultValue };
  },
  // ... 目前到 v100+
};

function migrate(persistedState) {
  const currentVersion = persistedState.meta.version || 0;
  const targetVersion = latestVersion;

  let state = persistedState;
  for (let v = currentVersion; v < targetVersion; v++) {
    state = migrations[v + 1](state);
    state.meta.version = v + 1;
  }

  return state;
}
```

---

## 3️⃣ Rainbow Wallet 的实现

### Rainbow RN 架构

```
┌────────────────────────────────────────────┐
│            React Native App                │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  redux + redux-persist                │ │
│  │   ├─ wallets (Redux slice)            │ │
│  │   ├─ transactions                     │ │
│  │   └─ settings                         │ │
│  └───────────────────────────────────────┘ │
│             │                               │
│             ▼                               │
│  ┌───────────────────────────────────────┐ │
│  │  AsyncStorage (with queue)            │ │
│  │   - iOS: NSUserDefaults               │ │
│  │   - Android: RocksDB (优化后)         │ │
│  └───────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### 核心机制

#### 1. **AsyncStorage 写入队列**

Rainbow 自己实现了一个写入队列：

```typescript
// 简化版
class QueuedAsyncStorage {
  private queue: Promise<void> = Promise.resolve();

  async setItem(key: string, value: string) {
    // 将写入操作加入队列
    this.queue = this.queue.then(async () => {
      await AsyncStorage.setItem(key, value);
    }).catch((error) => {
      console.error('Failed to write:', error);
      throw error;
    });

    return this.queue;
  }

  async getItem(key: string) {
    // 读取也需要排队（确保读取到最新数据）
    this.queue = this.queue.then(async () => {
      return await AsyncStorage.getItem(key);
    });

    return this.queue;
  }
}
```

**效果**：
- ✅ 所有操作顺序执行
- ✅ 避免并发冲突

---

#### 2. **分片 + 单一主 Store**

Rainbow 混合使用两种策略：

```typescript
// 主 Store（单一 key）
AsyncStorage.setItem('redux-persist', JSON.stringify({
  wallets: [...],
  transactions: [...],
  version: 10,
}));

// 缓存数据（分片）
AsyncStorage.multiSet([
  ['cache:nft-images', '...'],
  ['cache:token-prices', '...'],
]);
```

**理由**：
- 主数据：单一 key，便于原子写入
- 缓存数据：分片存储，可以单独清理

---

#### 3. **Android 使用 RocksDB**

Rainbow 在 Android 端使用了 `@react-native-async-storage/async-storage` 的 **next** 版本，底层换成了 **RocksDB**：

```javascript
// node_modules/@react-native-async-storage/async-storage/android/...

// 旧版：SQLite
// 新版：RocksDB

// RocksDB 优势：
// ✅ 更快（LSM-Tree 架构）
// ✅ 支持事务（WriteBatch）
// ✅ 更好的崩溃恢复
```

**WriteBatch 示例**（RocksDB 原生支持）：
```java
WriteBatch batch = db.createWriteBatch();
batch.put("key1", "value1");
batch.put("key2", "value2");
batch.put("key3", "value3");
db.write(batch); // 原子性写入
```

---

#### 4. **加密存储**

Rainbow 使用 `react-native-keychain`：

```typescript
import * as Keychain from 'react-native-keychain';

// 存储私钥（使用系统 Keychain/Keystore）
await Keychain.setGenericPassword(
  'wallet',
  privateKey,
  {
    service: 'com.rainbow.wallet',
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
  }
);

// iOS: Keychain（硬件 Secure Enclave）
// Android: Keystore（硬件 TEE）
```

**优势**：
- ✅ 硬件级加密
- ✅ 系统管理密钥（无法导出）
- ✅ 生物识别解锁

---

## 4️⃣ 我们的改进方案

基于 MetaMask 和 Rainbow 的经验，我需要添加：

### ✅ 已实现

1. **原子写入**（`createAtomicStorageAdapter`）- 类似 electron-store
2. **Checksum 校验**（`createChecksumStorageAdapter`）
3. **版本控制**（`createVersionedStorageAdapter`）

### 🚧 需要添加

#### 1. **写入队列（高优先级）**⭐⭐⭐

```typescript
// store/queuedStorageAdapter.ts
import { Mutex } from 'async-mutex';

export function createQueuedStorageAdapter(
  baseAdapter: StorageAdapter
): StorageAdapter {
  const mutex = new Mutex();

  return {
    getItem: async (key: string) => {
      // 读取也需要排队，确保读到最新数据
      return await mutex.runExclusive(async () => {
        return await baseAdapter.getItem(key);
      });
    },

    setItem: async (key: string, value: string) => {
      // 写入排队执行
      return await mutex.runExclusive(async () => {
        return await baseAdapter.setItem(key, value);
      });
    },

    removeItem: async (key: string) => {
      return await mutex.runExclusive(async () => {
        return await baseAdapter.removeItem(key);
      });
    },
  };
}
```

**解决的问题**：
- ✅ 防止并发写入覆盖
- ✅ 保证写入顺序
- ✅ RN/Electron 必备

---

#### 2. **状态分片（可选）**⭐

```typescript
// 当前：单一 key
localStorage.setItem('VaultsStore-storage', JSON.stringify(state));

// 改进：分片存储
localStorage.setItem('VaultsStore-storage', JSON.stringify({
  vaults: state.vaults,
  version: 1,
}));

localStorage.setItem('VaultsStore-cache', JSON.stringify({
  derivedData: state.derivedData,
}));
```

**好处**：
- 减少单次写入数据量
- 缓存数据可以单独清理

---

#### 3. **加密存储（钱包必备）**⭐⭐⭐

```typescript
// 使用 Keychain/Keystore 存储主密钥
import * as Keychain from 'react-native-keychain';

const masterKey = await Keychain.getGenericPassword('wallet');

// 使用主密钥加密存储
const encrypted = await encrypt(masterKey, JSON.stringify(state));
await AsyncStorage.setItem('vault', encrypted);
```

---

## 5️⃣ 推荐的最终架构

### Web / Electron

```typescript
import {
  createStoreFactory,
  createSafeStorageAdapter,
  createQueuedStorageAdapter, // 新增
} from '@repo/core/store';

const adapter = createQueuedStorageAdapter(
  createSafeStorageAdapter(defaultStorageAdapter)
);

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: adapter,
});
```

### React Native

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAsyncStorageAdapter,
  createQueuedStorageAdapter,
  createAtomicStorageAdapter,
} from '@repo/core/adapters/storageAdapters';

// 队列化异步存储
const adapter = createQueuedStorageAdapter(
  createAsyncStorageAdapter(AsyncStorage)
);

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: adapter,
  skipHydration: true,
});

await vaultService.hydrate();
```

### Chrome Extension

```typescript
// Background Script
import {
  createChromeStorageAdapter,
  createQueuedStorageAdapter,
  createAtomicStorageAdapter,
} from '@repo/core/adapters/storageAdapters';

const adapter = createQueuedStorageAdapter(
  createAtomicStorageAdapter(
    createChromeStorageAdapter('local')
  )
);

const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: adapter,
  skipHydration: true,
});
```

---

## 📊 对比总结

| 特性                | MetaMask       | Rainbow        | 我们的方案    |
|---------------------|----------------|----------------|---------------|
| 写入队列            | ✅ Semaphore   | ✅ Promise链   | ✅ Mutex      |
| 原子写入            | ✅ Chrome API  | ❌             | ✅ Double Buffer |
| 分片存储            | ✅             | ✅（混合）     | 🚧 可选       |
| 加密存储            | ✅ AES-GCM     | ✅ Keychain    | 🚧 待实现     |
| Checksum 校验       | ❌             | ❌             | ✅ CRC32      |
| 版本迁移            | ✅ v100+       | ✅             | ✅ Zod        |
| 跨标签页同步        | ✅             | N/A            | ✅ Storage Event |

---

## 🎯 下一步计划

1. ⭐⭐⭐ **立即实现**：写入队列（`createQueuedStorageAdapter`）
2. ⭐⭐ **重要**：加密存储装饰器
3. ⭐ **可选**：状态分片支持

需要我继续实现写入队列吗？
