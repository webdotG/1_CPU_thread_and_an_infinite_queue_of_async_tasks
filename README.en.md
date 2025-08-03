# Task Queue Executor

## Description

This module provides a `run` function for managing task execution with concurrency limits and inter-task dependencies.

The code implements an advanced task queue system with capabilities for:

- Limiting the maximum number of simultaneously executing tasks
- Managing dependencies between tasks (tasks with the same targetId do not execute in parallel)
- Efficient resource utilization when processing asynchronous tasks

### Where it can be useful

- **API clients** - when you need to limit the number of simultaneous requests to one server (targetId can represent a server identifier)
- **File processing** - for managing parallel file processing where files of the same type should not be processed simultaneously
- **Resource management** - when different tasks use shared resources (e.g., database access) and conflicts need to be avoided
- **Background tasks in web applications** - for organizing background operation queues with load control
- **Data collection systems** - when parsing or scraping, where parallel requests to one domain need to be limited
- **Microservice architectures** - for managing calls between services with consideration of their limitations

### Implementation features

- Support for asynchronous iterators for input task queues
- Dynamic execution thread management
- Efficient task distribution among available "slots"
- Guaranteed execution order for dependent tasks

## API

### Function `run`

```typescript
async function run(
  executor: IExecutor,
  queue: AsyncIterable<ITask>,
  maxThreads?: number,
): Promise<void>
```

#### Parameters

- **`executor`** - object implementing the `IExecutor` interface for task execution
- **`queue`** - asynchronous iterator providing a stream of tasks
- **`maxThreads`** - maximum number of simultaneously executing tasks (default: unlimited)

#### Interfaces

```typescript
interface ITask {
  targetId: number // Resource/target identifier
  data: any // Task data
}

interface IExecutor {
  executeTask(task: ITask): Promise<void>
}
```

### Basic example

```typescript
import run from './task-queue-executor'

const executor = {
  async executeTask(task) {
    console.log(`Executing task for target ${task.targetId}:`, task.data)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  },
}

async function* taskGenerator() {
  yield { targetId: 1, data: 'Task 1.1' }
  yield { targetId: 2, data: 'Task 2.1' } // Will execute in parallel
  yield { targetId: 1, data: 'Task 1.2' } // Will wait for 1.1 to complete
}

await run(executor, taskGenerator(), 3) // Maximum 3 parallel tasks
```

### HTTP client with limitations

```typescript
class ApiExecutor implements IExecutor {
  async executeTask(task: ITask) {
    const response = await fetch(task.data.url, task.data.options)
    return response.json()
  }
}

async function* apiTasks() {
  // Tasks for server1 will execute sequentially
  yield {
    targetId: hash('server1.com'),
    data: { url: 'https://server1.com/api/users' },
  }
  yield {
    targetId: hash('server1.com'),
    data: { url: 'https://server1.com/api/posts' },
  }

  // Tasks for server2 will execute in parallel with server1
  yield {
    targetId: hash('server2.com'),
    data: { url: 'https://server2.com/api/data' },
  }
}

await run(new ApiExecutor(), apiTasks(), 5)
```

## Architectural features

### Algorithm workflow

1. **Planning phase** - analysis of available tasks and dependency conflicts
2. **Execution phase** - launching maximum number of non-conflicting tasks
3. **Waiting phase** - monitoring completion of active tasks and resource release

### State management

- **`activeTargets`** - set of occupied resource identifiers
- **`activePromises`** - set of executing tasks
- **`pendingTasks`** - queue of tasks waiting for resource release

### Optimizations

- **No polling** - using `Promise.race()` for efficient waiting
- **Minimal allocations** - reusing data structures
- **Deadlock prevention** - guaranteed execution progress

## Requirements

- Node.js with ES2018+ support (async iterators)
- TypeScript 4.0+ (optional, for typing)

## Simple usage examples

### 📧 Email notification sending

```typescript
// Problem: Gmail API limits 250 requests per second
// Solution: limit parallel requests to one account

const emailExecutor = {
  async executeTask(task) {
    await sendEmail(task.data.to, task.data.subject, task.data.body)
  },
}

async function* emailQueue() {
  yield {
    targetId: 1,
    data: { to: 'user1@gmail.com', subject: 'Hello!', body: '...' },
  }
  yield {
    targetId: 1,
    data: { to: 'user2@gmail.com', subject: 'News', body: '...' },
  }
  yield {
    targetId: 2,
    data: { to: 'admin@company.com', subject: 'Report', body: '...' },
  }
}

// Maximum 5 emails simultaneously, but to Gmail API - only 1 at a time
await run(emailExecutor, emailQueue(), 5)
```

### 🔍 News website parsing

```typescript
// Problem: websites block on too frequent requests
// Solution: limit requests to each domain

const parseExecutor = {
  async executeTask(task) {
    const response = await fetch(task.data.url)
    const html = await response.text()
    return parseNewsArticle(html)
  },
}

async function* newsQueue() {
  // Maximum 1 request simultaneously to each site
  yield {
    targetId: hash('news.com'),
    data: { url: 'https://news.com/article1' },
  }
  yield {
    targetId: hash('gazette.com'),
    data: { url: 'https://gazette.com/article1' },
  } // In parallel
  yield {
    targetId: hash('news.com'),
    data: { url: 'https://news.com/article2' },
  } // Waits for first
}

await run(parseExecutor, newsQueue(), 20) // Overall limit of 20 requests
```

### 💾 Database backup

```typescript
// Problem: cannot simultaneously backup the same database
// Solution: serialize backups by database name

const backupExecutor = {
  async executeTask(task) {
    await createDatabaseBackup(task.data.database, task.data.backupPath)
  },
}

async function* backupQueue() {
  // Backups of different databases run in parallel
  yield {
    targetId: hash('users_db'),
    data: { database: 'users_db', backupPath: '/backups/users_1.sql' },
  }
  yield {
    targetId: hash('orders_db'),
    data: { database: 'orders_db', backupPath: '/backups/orders_1.sql' },
  }

  // Second backup of users_db will wait for the first
  yield {
    targetId: hash('users_db'),
    data: { database: 'users_db', backupPath: '/backups/users_2.sql' },
  }
}

await run(backupExecutor, backupQueue(), 3) // Maximum 3 backups simultaneously
```

### 📱 Push notifications

```typescript
// Problem: Firebase limits requests to one application
// Solution: group by application ID

const pushExecutor = {
  async executeTask(task) {
    await sendPushNotification(
      task.data.appId,
      task.data.token,
      task.data.message,
    )
  },
}

async function* pushQueue() {
  // Notifications for different apps run in parallel
  yield {
    targetId: 'app_android',
    data: { appId: 'app_android', token: 'token1', message: 'Hello!' },
  }
  yield {
    targetId: 'app_ios',
    data: { appId: 'app_ios', token: 'token2', message: 'News' },
  }

  // Second notification for Android waits for the first
  yield {
    targetId: 'app_android',
    data: { appId: 'app_android', token: 'token3', message: 'Sale!' },
  }
}

await run(pushExecutor, pushQueue(), 15)
```

## Advanced usage scenarios

### 🤖 Social bots with human behavior imitation

```typescript
// Problem: Facebook/Instagram detect bots by activity patterns
// Solution: one account = one session, human delay imitation

const socialBotExecutor = {
  async executeTask(task) {
    const account = task.data.account

    // Imitate human behavior
    await randomDelay(2000, 8000) // Random delay 2-8 sec

    switch (task.data.action) {
      case 'like':
        await account.likePost(task.data.postId)
        break
      case 'comment':
        await account.comment(task.data.postId, task.data.text)
        await randomDelay(1000, 3000) // Additional delay after comment
        break
      case 'follow':
        await account.followUser(task.data.userId)
        break
    }

    // Log activity to avoid detection
    await logActivity(account.id, task.data.action)
  },
}

async function* socialBotQueue() {
  // Each account works sequentially (targetId = account.id)
  yield {
    targetId: 101,
    data: { account: account1, action: 'like', postId: 'post123' },
  }
  yield {
    targetId: 102,
    data: { account: account2, action: 'follow', userId: 'user456' },
  } // In parallel
  yield {
    targetId: 101,
    data: {
      account: account1,
      action: 'comment',
      postId: 'post124',
      text: 'Nice!',
    },
  } // Waits for like
}

// 50 accounts can work in parallel, but each - sequentially
await run(socialBotExecutor, socialBotQueue(), 50)
```

### 🕸️ Distributed web scraping with proxy rotation

```typescript
// Problem: sites block IPs, need complex proxy and User-Agent rotation
// Solution: grouping by domain + IP to avoid detection

const advancedScraperExecutor = {
  async executeTask(task) {
    const { domain, url, proxyPool, userAgents } = task.data

    // Select proxy for this domain
    const proxy = proxyPool.getNextProxy(domain)
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)]

    try {
      // Use random headers to imitate browser
      const response = await fetch(url, {
        agent: proxy,
        headers: {
          'User-Agent': userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          Connection: 'keep-alive',
        },
      })

      // Random delay between requests to one domain
      await randomDelay(3000, 10000)

      return await response.text()
    } catch (error) {
      // Mark proxy as problematic
      proxyPool.markBadProxy(proxy, domain)
      throw error
    }
  },
}

async function* scraperQueue() {
  // Requests to one domain go through one proxy sequentially
  yield {
    targetId: hash('target-site.com'),
    data: {
      domain: 'target-site.com',
      url: 'https://target-site.com/page1',
      proxyPool: proxyManager,
      userAgents: browserUserAgents,
    },
  }

  yield {
    targetId: hash('another-site.com'),
    data: {
      domain: 'another-site.com',
      url: 'https://another-site.com/data',
      proxyPool: proxyManager,
      userAgents: browserUserAgents,
    },
  }

  // Second request to target-site.com will wait and use the same proxy
  yield {
    targetId: hash('target-site.com'),
    data: {
      domain: 'target-site.com',
      url: 'https://target-site.com/page2',
      proxyPool: proxyManager,
      userAgents: browserUserAgents,
    },
  }
}

await run(advancedScraperExecutor, scraperQueue(), 20)
```

### 🎯 Automated trading with risk management

```typescript
// Problem: cannot simultaneously open opposite positions on one asset
// Solution: serialization of operations by asset symbol

const tradingExecutor = {
  async executeTask(task) {
    const { symbol, action, amount, strategy } = task.data

    // Check current positions for this asset
    const currentPosition = await getPosition(symbol)

    // Analyze risks before execution
    const riskAssessment = await calculateRisk(
      symbol,
      action,
      amount,
      currentPosition,
    )

    if (riskAssessment.risk > strategy.maxRisk) {
      console.log(`Skipping trade ${symbol}: high risk ${riskAssessment.risk}`)
      return
    }

    // Execute trade
    switch (action) {
      case 'buy':
        await placeBuyOrder(symbol, amount, riskAssessment.stopLoss)
        break
      case 'sell':
        await placeSellOrder(symbol, amount, riskAssessment.takeProfit)
        break
      case 'close':
        await closePosition(symbol)
        break
    }

    // Log for strategy analysis
    await logTrade(symbol, action, amount, riskAssessment)
  },
}

async function* tradingQueue() {
  // Trades for one asset execute sequentially
  yield {
    targetId: hash('BTCUSDT'),
    data: {
      symbol: 'BTCUSDT',
      action: 'buy',
      amount: 0.1,
      strategy: { maxRisk: 0.02, stopLoss: 0.05 },
    },
  }

  yield {
    targetId: hash('ETHUSDT'),
    data: {
      symbol: 'ETHUSDT',
      action: 'buy',
      amount: 1.0,
      strategy: { maxRisk: 0.02, stopLoss: 0.05 },
    },
  } // In parallel with BTC

  // BTC position closing will wait for opening
  yield {
    targetId: hash('BTCUSDT'),
    data: {
      symbol: 'BTCUSDT',
      action: 'close',
    },
  }
}

await run(tradingExecutor, tradingQueue(), 10)
```

### 🎮 Gaming bots with anti-detection

```typescript
// Problem: game servers detect bots by action patterns
// Solution: each character acts independently with human patterns

const gameBotExecutor = {
  async executeTask(task) {
    const { character, action, gameSession } = task.data

    // Imitate human reaction
    const humanDelay = calculateHumanDelay(action.complexity)
    await sleep(humanDelay)

    // Add random micro-mouse movements
    await simulateMouseMovement()

    switch (action.type) {
      case 'farm':
        await character.farmResource(action.location)
        // Random breaks like humans
        if (Math.random() < 0.1) await sleep(randomBetween(5000, 15000))
        break

      case 'fight':
        await character.engageCombat(action.target)
        // Imitate human tactics
        await simulateHumanCombat(character, action.target)
        break

      case 'trade':
        await character.tradeWithNPC(action.npc, action.items)
        break
    }

    // Log actions for pattern analysis
    await logCharacterActivity(character.id, action, humanDelay)
  },
}

async function* gameBotQueue() {
  // Each character acts independently (targetId = character.id)
  yield {
    targetId: 'char_warrior_1',
    data: {
      character: warrior1,
      action: { type: 'farm', location: 'forest', complexity: 'low' },
      gameSession: session1,
    },
  }

  yield {
    targetId: 'char_mage_1',
    data: {
      character: mage1,
      action: { type: 'fight', target: 'dragon', complexity: 'high' },
      gameSession: session2,
    },
  } // In parallel

  // Next warrior action will wait for farming completion
  yield {
    targetId: 'char_warrior_1',
    data: {
      character: warrior1,
      action: { type: 'trade', npc: 'merchant', items: ['wood', 'stone'] },
      gameSession: session1,
    },
  }
}

await run(gameBotExecutor, gameBotQueue(), 25)
```

### 🏭 Industrial IoT automation

```typescript
// Problem: cannot simultaneously control one device with different commands
// Solution: command serialization by device_id

const iotExecutor = {
  async executeTask(task) {
    const { deviceId, command, parameters, priority } = task.data

    // Check device status
    const deviceStatus = await getDeviceStatus(deviceId)

    if (deviceStatus.state === 'maintenance') {
      console.log(`Device ${deviceId} under maintenance, skipping command`)
      return
    }

    // Critical commands have priority
    if (priority === 'critical') {
      await sendUrgentCommand(deviceId, command, parameters)
    } else {
      await sendCommand(deviceId, command, parameters)
    }

    // Wait for execution confirmation
    await waitForCommandAck(deviceId, command.id)

    // Log for monitoring
    await logDeviceOperation(deviceId, command, parameters, Date.now())
  },
}

async function* iotCommandQueue() {
  // Commands for one device execute sequentially
  yield {
    targetId: 'conveyor_belt_01',
    data: {
      deviceId: 'conveyor_belt_01',
      command: { type: 'start', id: 'cmd_001' },
      parameters: { speed: 100 },
      priority: 'normal',
    },
  }

  yield {
    targetId: 'robot_arm_02',
    data: {
      deviceId: 'robot_arm_02',
      command: { type: 'move', id: 'cmd_002' },
      parameters: { x: 150, y: 200, z: 50 },
      priority: 'normal',
    },
  } // In parallel with conveyor

  // Emergency stop of conveyor will wait for start
  yield {
    targetId: 'conveyor_belt_01',
    data: {
      deviceId: 'conveyor_belt_01',
      command: { type: 'emergency_stop', id: 'cmd_003' },
      parameters: {},
      priority: 'critical',
    },
  }
}

await run(iotExecutor, iotCommandQueue(), 100)
```

### 🧠 Distributed machine learning

```typescript
// Problem: cannot simultaneously update one model with different gradients
// Solution: serialization of updates by model_id

const mlTrainingExecutor = {
  async executeTask(task) {
    const { modelId, gradients, batch, epoch, nodeId } = task.data

    // Load current model state
    const currentModel = await loadModel(modelId)

    // Apply gradients
    const updatedWeights = await applyGradients(currentModel.weights, gradients)

    // Calculate metrics
    const metrics = await calculateMetrics(updatedWeights, batch)

    // Save updated model
    await saveModel(modelId, {
      weights: updatedWeights,
      epoch: epoch,
      batch: batch,
      metrics: metrics,
      updatedBy: nodeId,
      timestamp: Date.now(),
    })

    // Notify other nodes about update
    await broadcastModelUpdate(modelId, metrics)

    console.log(
      `Model ${modelId} updated by node ${nodeId}, epoch ${epoch}, loss: ${metrics.loss}`,
    )
  },
}

async function* trainingQueue() {
  // Updates of one model go sequentially
  yield {
    targetId: 'model_nlp_v1',
    data: {
      modelId: 'model_nlp_v1',
      gradients: gradients_batch_1,
      batch: 1,
      epoch: 15,
      nodeId: 'gpu_node_1',
    },
  }

  yield {
    targetId: 'model_cv_v2',
    data: {
      modelId: 'model_cv_v2',
      gradients: gradients_batch_1,
      batch: 1,
      epoch: 8,
      nodeId: 'gpu_node_2',
    },
  } // In parallel

  // Next batch of NLP model will wait for previous
  yield {
    targetId: 'model_nlp_v1',
    data: {
      modelId: 'model_nlp_v1',
      gradients: gradients_batch_2,
      batch: 2,
      epoch: 15,
      nodeId: 'gpu_node_3',
    },
  }
}

await run(mlTrainingExecutor, trainingQueue(), 8) // 8 GPU nodes
```

## License

MIT

---

**📖 Other languages:** [🇷🇺 Русский](./README.ru.md)
