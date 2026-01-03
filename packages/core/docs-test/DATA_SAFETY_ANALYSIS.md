# 🔒 数据安全性分析

## ⚠️ 当前存在的风险

### 1️⃣ 竞态写入问题

#### 问题 A：同一 Store 内的并发 Action

**场景**：
```typescript
// 两个异步 action 同时执行
Promise.all([
  vaultService.store.getState().fetchAndAdd('vault-1'),
  vaultService.store.getState().fetchAndAdd('vault-2'),
]);
```

**风险**：
- ❌ 两个 action 可能同时读取 `vaults: []`
- ❌ 各自添加一个 vault 后写回
- ❌ **后写入的覆盖先写入的，丢失一个 vault**

**当前代码问题**（`store/factory.ts:140`）：
```typescript
const wrappedActions = mapValues(rawActions, (action, key) => {
  return (...args: any[]) => {
    const result = action(...args);
    if (result instanceof Promise) {
      return result.finally(() => {
        currentActionName = undefined;
      });
    }
    // ❌ 异步 action 并发执行，没有互斥锁
  };
});
```

---

#### 问题 B：跨标签页/窗口的并发写入

**场景**：
- 用户打开两个标签页
- 标签页 A 添加 vault-1
- 标签页 B 同时添加 vault-2

**风险**：
- ❌ 两个标签页各自读取 localStorage
- ❌ 各自写入，**后写入的覆盖先写入的**
- ❌ 用户在 A 标签添加的 vault 丢失

**当前代码问题**：
- 没有监听 `storage` 事件
- 没有跨标签页同步机制

---

#### 问题 C：Zustand persist 的写入时机

**Zustand persist 默认行为**：
- 每次 `set()` 调用后，**立即同步写入** localStorage
- 如果连续调用多次 `set()`，会触发多次写入

**风险**：
```typescript
// 批量操作
for (let i = 0; i < 100; i++) {
  vaultService.store.getState().add(vaults[i]);
  // ❌ 每次都写入 localStorage，性能差
  // ❌ 如果中途崩溃，部分写入
}
```

---

### 2️⃣ 写入中断导致的数据损坏

#### 问题 A：JSON.stringify 过程中崩溃

**场景**：
```typescript
const hugeState = {
  vaults: Array(10000).fill({ /* 大量数据 */ })
};
// JSON.stringify 可能耗时 100ms+
const json = JSON.stringify(hugeState); // ❌ 如果这时崩溃？
localStorage.setItem('store', json);
```

**风险**：
- ❌ stringify 过程中内存溢出/崩溃
- ❌ 旧数据已被清除，新数据未写入
- ❌ **用户数据永久丢失**

---

#### 问题 B：localStorage.setItem 不是完全原子的

**浏览器行为**：
- 大部分浏览器的 `setItem` 是原子的（要么全部写入，要么全不写入）
- 但在某些情况下（磁盘满、权限不足），可能**部分写入**

**当前代码问题**（`store/storage.ts:120`）：
```typescript
setItem: (name: string, value: StorageValue<PersistedState>) => {
  const result = storageAdapter.setItem(name, JSON.stringify(value));
  // ❌ 没有错误处理
  // ❌ 没有写入验证
  // ❌ 没有备份机制
}
```

---

#### 问题 C：读取时的数据损坏检测

**场景**：
- 数据写入到一半时系统崩溃
- 下次启动时读取到损坏的 JSON

**当前代码**（`store/storage.ts:97`）：
```typescript
try {
  const parsed = JSON.parse(str);
  const result = schema.safeParse(parsed.state);
  // ✅ Zod 校验可以检测结构错误
  // ❌ 但无法检测"部分写入"导致的数据截断
} catch (e) {
  console.error('Failed to parse storage:', e);
  return null; // ❌ 直接丢弃数据，没有恢复机制
}
```

---

## 🛡️ 风险等级评估

| 风险                     | 发生概率 | 影响程度 | 优先级 |
|--------------------------|----------|----------|--------|
| 同一 Store 并发 Action   | 🟡 中    | 🔴 高    | P0     |
| 跨标签页并发写入         | 🟢 低    | 🔴 高    | P1     |
| JSON.stringify 崩溃      | 🟢 低    | 🔴 极高  | P0     |
| localStorage 写入失败    | 🟢 低    | 🟡 中    | P1     |
| 数据损坏无法恢复         | 🟢 低    | 🔴 极高  | P0     |

**结论**：对于钱包这种关键数据，**必须解决 P0 级别的风险**。

---

## ✅ 解决方案设计

### 方案 1：原子写入（Double Buffer）⭐⭐⭐

**原理**：
1. 写入到临时 key（`store-temp`）
2. 写入成功后，原子性重命名（`store-temp` → `store`）
3. 如果崩溃，旧数据仍在 `store`，不受影响

**实现**：
```typescript
setItem: (name, value) => {
  const tempKey = `${name}.tmp`;
  const backupKey = `${name}.bak`;

  // 1. 备份当前数据
  const current = localStorage.getItem(name);
  if (current) {
    localStorage.setItem(backupKey, current);
  }

  // 2. 写入到临时 key
  localStorage.setItem(tempKey, JSON.stringify(value));

  // 3. 验证写入
  const written = localStorage.getItem(tempKey);
  if (!written || written !== JSON.stringify(value)) {
    throw new Error('Write verification failed');
  }

  // 4. 原子性重命名（删除旧的，重命名新的）
  localStorage.removeItem(name);
  localStorage.setItem(name, written);
  localStorage.removeItem(tempKey);
}
```

**优点**：
- ✅ 写入失败不影响原数据
- ✅ 有备份可恢复
- ✅ 简单高效

**缺点**：
- ⚠️ 需要 3 倍存储空间（原数据 + 临时 + 备份）

---

### 方案 2：防抖写入 + 版本控制 ⭐⭐

**原理**：
1. 使用 lodash `debounce` 延迟写入（300ms）
2. 每次写入时增加版本号
3. 读取时检查版本号，拒绝旧数据

**实现**：
```typescript
import { debounce } from 'lodash-es';

const debouncedWrite = debounce((key, value) => {
  const versioned = {
    version: Date.now(),
    data: value,
  };
  localStorage.setItem(key, JSON.stringify(versioned));
}, 300, { maxWait: 1000 });

// Zustand persist 配置
{
  storage: {
    setItem: (name, value) => debouncedWrite(name, value),
  }
}
```

**优点**：
- ✅ 减少写入频率，提升性能
- ✅ 版本控制防止旧数据覆盖

**缺点**：
- ⚠️ 延迟写入可能丢失最后 300ms 的数据（崩溃时）
- ⚠️ 需要配合 `beforeunload` 强制写入

---

### 方案 3：跨标签页同步 ⭐⭐⭐

**原理**：
1. 监听 `storage` 事件
2. 其他标签页修改数据时，当前标签页自动 rehydrate
3. 使用 **Last Write Wins** + 版本号

**实现**：
```typescript
// factory.ts
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === `${name}-storage` && e.newValue) {
      // 其他标签页修改了数据，重新加载
      store.persist.rehydrate();
    }
  });
}
```

**优点**：
- ✅ 多标签页数据一致
- ✅ 实时同步

**缺点**：
- ⚠️ 如果两个标签页同时写入，后写入的仍会覆盖
- ⚠️ 需要配合"操作日志"实现真正的 CRDT 合并

---

### 方案 4：Checksum 校验 + 自动恢复 ⭐⭐⭐

**原理**：
1. 写入时计算 CRC32/SHA256 校验和
2. 读取时验证校验和
3. 损坏时自动回滚到备份

**实现**：
```typescript
import CRC32 from 'crc-32';

// 写入
const data = JSON.stringify(value);
const checksum = CRC32.str(data);
localStorage.setItem(name, JSON.stringify({ data, checksum }));

// 读取
const stored = JSON.parse(localStorage.getItem(name));
if (CRC32.str(stored.data) !== stored.checksum) {
  console.error('Data corrupted, loading backup');
  return loadBackup(name);
}
```

**优点**：
- ✅ 检测任何数据损坏
- ✅ 自动恢复

**缺点**：
- ⚠️ 计算校验和有性能开销（大数据时）

---

### 方案 5：WAL (Write-Ahead Logging) ⭐

**原理**（类似 SQLite）：
1. 先写操作日志到 `store.wal`
2. 日志写入成功后，应用到主数据
3. 崩溃恢复时，重放日志

**实现复杂度**：高，适合企业级场景

---

## 🎯 推荐方案组合

### 生产环境推荐配置：

```typescript
createStoreFactory({ 
  name: 'VaultsStore',
  schema: VaultsStateSchema,

  // ✅ 1. 原子写入
  storageAdapter: createAtomicStorageAdapter(localStorageAdapter),

  // ✅ 2. 防抖写入（减少频率）
  writeDebounce: 300,

  // ✅ 3. 数据校验
  enableChecksum: true,

  // ✅ 4. 跨标签页同步
  enableCrossTabSync: true,

  // ✅ 5. 备份策略
  backupStrategy: 'rolling', // 保留最近 3 个版本
});
```

---

## 📊 各方案对比

| 方案             | 防竞态 | 防损坏 | 性能 | 复杂度 | 推荐度 |
|------------------|--------|--------|------|--------|--------|
| 原子写入         | ❌     | ✅     | ⭐⭐⭐ | 低     | ⭐⭐⭐  |
| 防抖写入         | ✅     | ❌     | ⭐⭐⭐ | 低     | ⭐⭐   |
| 跨标签页同步     | ⚠️     | ❌     | ⭐⭐  | 中     | ⭐⭐⭐  |
| Checksum 校验    | ❌     | ✅     | ⭐⭐  | 中     | ⭐⭐⭐  |
| WAL              | ✅     | ✅     | ⭐    | 高     | ⭐     |

**最佳实践**：组合使用 1 + 3 + 4（原子写入 + 跨标签页同步 + Checksum）

---

## 🚧 下一步

我将实现：
1. `createAtomicStorageAdapter` - 原子写入装饰器
2. `createDebouncedStorageAdapter` - 防抖写入装饰器
3. `enableCrossTabSync` - 跨标签页同步
4. `createChecksumStorageAdapter` - 数据校验装饰器

需要我继续实现吗？
