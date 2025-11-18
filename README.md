# Task Queue Executor

<div align="center">
  
**Choose your language / Выберите язык:**

[English](./README.en.md) | [Русский](./README.ru.md)

---

</div>

## Quick Overview

Advanced async task queue with intelligent dependency resolution and concurrency control.

**Продвинутая очередь задач с умным управлением зависимостями и параллелизмом.**

## Key Features

- **Concurrency Control** - Limit simultaneous tasks
- **Dependency Resolution** - Serialize tasks by targetId
- **Stream Processing** - Support for async iterators
- **Resource Management** - Prevent conflicts

**Основные возможности:**

- **Контроль параллелизма** - ограничение одновременных задач
- **Управление зависимостями** - сериализация по targetId
- **Потоковая обработка** - поддержка async итераторов
- **Управление ресурсами** - предотвращение конфликтов

## Basic Usage

```typescript
import run from 'task-queue-executor'

const executor = {
  async executeTask(task) {
    console.log(`Processing task for target ${task.targetId}:`, task.data)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  },
}

async function* taskGenerator() {
  yield { targetId: 1, data: 'Task 1.1' }
  yield { targetId: 2, data: 'Task 2.1' } // Runs in parallel
  yield { targetId: 1, data: 'Task 1.2' } // Waits for 1.1
}

await run(executor, taskGenerator(), 3) // Max 3 parallel tasks
```

## Full Documentation

For complete documentation, examples, and advanced use cases:

**Для полной документации, примеров и продвинутых сценариев:**

- [**English Documentation**](./README.en.md) - Complete guide with advanced examples
- [**Русская документация**](./README.ru.md) - Полное руководство с примерами

## License

MIT License - see [LICENSE](./LICENSE) file

---

<div align="center">

**⭐**  


Made with by [Kirill Grant](https://t.me/KirillGrant)

</div>
