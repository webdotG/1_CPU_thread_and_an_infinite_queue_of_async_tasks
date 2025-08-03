# Task Queue Executor

## Описание

Этот модуль предоставляет функцию `run` для управления выполнением задач с учетом ограничений параллелизма и зависимостей между задачами.

Код реализует продвинутую систему очереди задач с возможностью:
- Ограничения максимального количества одновременно выполняемых задач
- Управления зависимостями между задачами (задачи с одинаковым targetId не выполняются параллельно)
- Эффективного использования ресурсов при обработке асинхронных задач

### Где может быть полезно

- **API-клиенты** - когда нужно ограничить количество одновременных запросов к одному серверу (targetId может представлять идентификатор сервера)
- **Обработка файлов** - для управления параллельной обработкой файлов, где файлы одного типа не должны обрабатываться одновременно
- **Управление ресурсами** - когда разные задачи используют общие ресурсы (например, доступ к БД) и нужно избегать конфликтов
- **Фоновые задачи в веб-приложениях** - для организации очереди фоновых операций с контролем нагрузки
- **Системы сбора данных** - при парсинге или скрапинге, где нужно ограничивать параллельные запросы к одному домену
- **Микросервисные архитектуры** - для управления вызовами между сервисами с учетом их ограничений

### Особенности реализации

- Поддержка асинхронных итераторов для входной очереди задач
- Динамическое управление потоками выполнения
- Эффективное распределение задач между доступными "слотами"
- Гарантия порядка выполнения зависимых задач

## API

### Функция `run`

```typescript
async function run(
  executor: IExecutor,
  queue: AsyncIterable<ITask>,
  maxThreads?: number
): Promise<void>
```

#### Параметры

- **`executor`** - объект, реализующий интерфейс `IExecutor` для выполнения задач
- **`queue`** - асинхронный итератор, предоставляющий поток задач
- **`maxThreads`** - максимальное количество одновременно выполняемых задач (по умолчанию: без ограничений)

#### Интерфейсы

```typescript
interface ITask {
  targetId: number;  // Идентификатор ресурса/цели
  data: any;        // Данные задачи
}

interface IExecutor {
  executeTask(task: ITask): Promise<void>;
}
```

### Базовый пример
```typescript
import run from './task-queue-executor';

const executor = {
  async executeTask(task) {
    console.log(`Выполняется задача для target ${task.targetId}:`, task.data);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

async function* taskGenerator() {
  yield { targetId: 1, data: 'Задача 1.1' };
  yield { targetId: 2, data: 'Задача 2.1' }; // Выполнится параллельно
  yield { targetId: 1, data: 'Задача 1.2' }; // Дождется завершения 1.1
}

await run(executor, taskGenerator(), 3); // Максимум 3 параллельных задачи
```

### HTTP-клиент с ограничениями
```typescript
class ApiExecutor implements IExecutor {
  async executeTask(task: ITask) {
    const response = await fetch(task.data.url, task.data.options);
    return response.json();
  }
}

async function* apiTasks() {
  // Задачи для server1 выполнятся последовательно
  yield { targetId: hash('server1.com'), data: { url: 'https://server1.com/api/users' }};
  yield { targetId: hash('server1.com'), data: { url: 'https://server1.com/api/posts' }};
  
  // Задачи для server2 выполнятся параллельно с server1
  yield { targetId: hash('server2.com'), data: { url: 'https://server2.com/api/data' }};
}

await run(new ApiExecutor(), apiTasks(), 5);
```

## Архитектурные особенности

### Алгоритм работы
1. **Фаза планирования** - анализ доступных задач и конфликтов зависимостей
2. **Фаза выполнения** - запуск максимального количества неконфликтующих задач
3. **Фаза ожидания** - мониторинг завершения активных задач и освобождения ресурсов

### Управление состоянием
- **`activeTargets`** - множество занятых идентификаторов ресурсов
- **`activePromises`** - множество выполняющихся задач
- **`pendingTasks`** - очередь задач, ожидающих освобождения ресурсов

### Оптимизации
- **Отсутствие polling'а** - использование `Promise.race()` для эффективного ожидания
- **Минимум аллокаций** - переиспользование структур данных
- **Предотвращение deadlock'ов** - гарантированный прогресс выполнения

## Требования

- Node.js с поддержкой ES2018+ (async iterators)
- TypeScript 4.0+ (опционально, для типизации)


## Простые примеры использования

### 📧 Отправка email-уведомлений

```typescript
// Проблема: Gmail API ограничивает 250 запросов в секунду
// Решение: ограничиваем параллельные запросы к одному аккаунту

const emailExecutor = {
  async executeTask(task) {
    await sendEmail(task.data.to, task.data.subject, task.data.body);
  }
};

async function* emailQueue() {
  yield { targetId: 1, data: { to: 'user1@gmail.com', subject: 'Привет!', body: '...' }};
  yield { targetId: 1, data: { to: 'user2@gmail.com', subject: 'Новости', body: '...' }};
  yield { targetId: 2, data: { to: 'admin@company.com', subject: 'Отчет', body: '...' }};
}

// Максимум 5 email одновременно, но к Gmail API - только 1 за раз
await run(emailExecutor, emailQueue(), 5);
```

### 🔍 Парсинг новостных сайтов

```typescript
// Проблема: сайты блокируют при слишком частых запросах
// Решение: ограничиваем запросы к каждому домену

const parseExecutor = {
  async executeTask(task) {
    const response = await fetch(task.data.url);
    const html = await response.text();
    return parseNewsArticle(html);
  }
};

async function* newsQueue() {
  // К каждому сайту - максимум 1 запрос одновременно
  yield { targetId: hash('news.ru'), data: { url: 'https://news.ru/article1' }};
  yield { targetId: hash('gazeta.ru'), data: { url: 'https://gazeta.ru/article1' }}; // Параллельно
  yield { targetId: hash('news.ru'), data: { url: 'https://news.ru/article2' }}; // Ждет первый
}

await run(parseExecutor, newsQueue(), 20); // Общий лимит 20 запросов
```

### 💾 Резервное копирование баз данных

```typescript
// Проблема: нельзя одновременно делать бэкап одной БД
// Решение: сериализуем бэкапы по имени БД

const backupExecutor = {
  async executeTask(task) {
    await createDatabaseBackup(task.data.database, task.data.backupPath);
  }
};

async function* backupQueue() {
  // Бэкапы разных БД идут параллельно
  yield { targetId: hash('users_db'), data: { database: 'users_db', backupPath: '/backups/users_1.sql' }};
  yield { targetId: hash('orders_db'), data: { database: 'orders_db', backupPath: '/backups/orders_1.sql' }};
  
  // Второй бэкап users_db подождет первого
  yield { targetId: hash('users_db'), data: { database: 'users_db', backupPath: '/backups/users_2.sql' }};
}

await run(backupExecutor, backupQueue(), 3); // Максимум 3 бэкапа одновременно
```

### 📱 Push-уведомления

```typescript
// Проблема: Firebase ограничивает количество запросов к одному приложению
// Решение: группируем по ID приложения

const pushExecutor = {
  async executeTask(task) {
    await sendPushNotification(task.data.appId, task.data.token, task.data.message);
  }
};

async function* pushQueue() {
  // Уведомления для разных приложений идут параллельно
  yield { targetId: 'app_android', data: { appId: 'app_android', token: 'token1', message: 'Привет!' }};
  yield { targetId: 'app_ios', data: { appId: 'app_ios', token: 'token2', message: 'Новости' }};
  
  // Второе уведомление для Android ждет первого
  yield { targetId: 'app_android', data: { appId: 'app_android', token: 'token3', message: 'Скидка!' }};
}

await run(pushExecutor, pushQueue(), 15);
```


# Продвинутые сценарии использования

### 🤖 Социальные боты с имитацией человеческого поведения

```typescript
// Проблема: Facebook/Instagram детектят ботов по паттернам активности
// Решение: один аккаунт = одна сессия, имитация человеческих задержек

const socialBotExecutor = {
  async executeTask(task) {
    const account = task.data.account;
    
    // Имитируем человеческое поведение
    await randomDelay(2000, 8000); // Случайная задержка 2-8 сек
    
    switch(task.data.action) {
      case 'like':
        await account.likePost(task.data.postId);
        break;
      case 'comment':
        await account.comment(task.data.postId, task.data.text);
        await randomDelay(1000, 3000); // Дополнительная задержка после комментария
        break;
      case 'follow':
        await account.followUser(task.data.userId);
        break;
    }
    
    // Логируем активность для избежания детекции
    await logActivity(account.id, task.data.action);
  }
};

async function* socialBotQueue() {
  // Каждый аккаунт работает последовательно (targetId = account.id)
  yield { targetId: 101, data: { account: account1, action: 'like', postId: 'post123' }};
  yield { targetId: 102, data: { account: account2, action: 'follow', userId: 'user456' }}; // Параллельно
  yield { targetId: 101, data: { account: account1, action: 'comment', postId: 'post124', text: 'Nice!' }}; // Ждет лайк
}

// 50 аккаунтов могут работать параллельно, но каждый - последовательно
await run(socialBotExecutor, socialBotQueue(), 50);
```

### 🕸️ Распределенный веб-скрепинг с ротацией прокси

```typescript
// Проблема: сайты блокируют IP, нужна сложная ротация прокси и User-Agent
// Решение: группировка по домену + IP для избежания детекции

const advancedScraperExecutor = {
  async executeTask(task) {
    const { domain, url, proxyPool, userAgents } = task.data;
    
    // Выбираем прокси для этого домена
    const proxy = proxyPool.getNextProxy(domain);
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    try {
      // Используем случайные заголовки для имитации браузера
      const response = await fetch(url, {
        agent: proxy,
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        }
      });
      
      // Случайная задержка между запросами к одному домену
      await randomDelay(3000, 10000);
      
      return await response.text();
    } catch (error) {
      // Помечаем прокси как проблемный
      proxyPool.markBadProxy(proxy, domain);
      throw error;
    }
  }
};

async function* scraperQueue() {
  // Запросы к одному домену идут через один прокси последовательно
  yield { targetId: hash('target-site.com'), data: { 
    domain: 'target-site.com', 
    url: 'https://target-site.com/page1',
    proxyPool: proxyManager,
    userAgents: browserUserAgents
  }};
  
  yield { targetId: hash('another-site.com'), data: { 
    domain: 'another-site.com', 
    url: 'https://another-site.com/data',
    proxyPool: proxyManager,
    userAgents: browserUserAgents
  }};
  
  // Второй запрос к target-site.com подождет и использует тот же прокси
  yield { targetId: hash('target-site.com'), data: { 
    domain: 'target-site.com', 
    url: 'https://target-site.com/page2',
    proxyPool: proxyManager,
    userAgents: browserUserAgents
  }};
}

await run(advancedScraperExecutor, scraperQueue(), 20);
```

### 🎯 Автоматизированная торговля с управлением рисками

```typescript
// Проблема: нельзя одновременно открывать противоположные позиции по одному активу
// Решение: сериализация операций по символу актива

const tradingExecutor = {
  async executeTask(task) {
    const { symbol, action, amount, strategy } = task.data;
    
    // Проверяем текущие позиции по этому активу
    const currentPosition = await getPosition(symbol);
    
    // Анализируем риски перед выполнением
    const riskAssessment = await calculateRisk(symbol, action, amount, currentPosition);
    
    if (riskAssessment.risk > strategy.maxRisk) {
      console.log(`Пропускаем сделку ${symbol}: высокий риск ${riskAssessment.risk}`);
      return;
    }
    
    // Выполняем сделку
    switch(action) {
      case 'buy':
        await placeBuyOrder(symbol, amount, riskAssessment.stopLoss);
        break;
      case 'sell':
        await placeSellOrder(symbol, amount, riskAssessment.takeProfit);
        break;
      case 'close':
        await closePosition(symbol);
        break;
    }
    
    // Логируем для анализа стратегии
    await logTrade(symbol, action, amount, riskAssessment);
  }
};

async function* tradingQueue() {
  // Сделки по одному активу выполняются последовательно
  yield { targetId: hash('BTCUSDT'), data: { 
    symbol: 'BTCUSDT', 
    action: 'buy', 
    amount: 0.1,
    strategy: { maxRisk: 0.02, stopLoss: 0.05 }
  }};
  
  yield { targetId: hash('ETHUSDT'), data: { 
    symbol: 'ETHUSDT', 
    action: 'buy', 
    amount: 1.0,
    strategy: { maxRisk: 0.02, stopLoss: 0.05 }
  }}; // Параллельно с BTC
  
  // Закрытие позиции BTC подождет открытия
  yield { targetId: hash('BTCUSDT'), data: { 
    symbol: 'BTCUSDT', 
    action: 'close'
  }};
}

await run(tradingExecutor, tradingQueue(), 10);
```

### 🎮 Игровые боты с антидетекцией

```typescript
// Проблема: игровые сервера детектят ботов по паттернам действий
// Решение: каждый персонаж действует независимо с человеческими паттернами

const gameBotExecutor = {
  async executeTask(task) {
    const { character, action, gameSession } = task.data;
    
    // Имитируем человеческую реакцию
    const humanDelay = calculateHumanDelay(action.complexity);
    await sleep(humanDelay);
    
    // Добавляем случайные микро-движения мыши
    await simulateMouseMovement();
    
    switch(action.type) {
      case 'farm':
        await character.farmResource(action.location);
        // Случайные перерывы как у человека
        if (Math.random() < 0.1) await sleep(randomBetween(5000, 15000));
        break;
        
      case 'fight':
        await character.engageCombat(action.target);
        // Имитируем человеческую тактику
        await simulateHumanCombat(character, action.target);
        break;
        
      case 'trade':
        await character.tradeWithNPC(action.npc, action.items);
        break;
    }
    
    // Логируем действия для анализа паттернов
    await logCharacterActivity(character.id, action, humanDelay);
  }
};

async function* gameBotQueue() {
  // Каждый персонаж действует независимо (targetId = character.id)
  yield { targetId: 'char_warrior_1', data: { 
    character: warrior1, 
    action: { type: 'farm', location: 'forest', complexity: 'low' },
    gameSession: session1
  }};
  
  yield { targetId: 'char_mage_1', data: { 
    character: mage1, 
    action: { type: 'fight', target: 'dragon', complexity: 'high' },
    gameSession: session2
  }}; // Параллельно
  
  // Следующее действие воина подождет завершения фарма
  yield { targetId: 'char_warrior_1', data: { 
    character: warrior1, 
    action: { type: 'trade', npc: 'merchant', items: ['wood', 'stone'] },
    gameSession: session1
  }};
}

await run(gameBotExecutor, gameBotQueue(), 25);
```

### 🏭 Промышленная автоматизация IoT

```typescript
// Проблема: нельзя одновременно управлять одним устройством разными командами
// Решение: сериализация команд по device_id

const iotExecutor = {
  async executeTask(task) {
    const { deviceId, command, parameters, priority } = task.data;
    
    // Проверяем статус устройства
    const deviceStatus = await getDeviceStatus(deviceId);
    
    if (deviceStatus.state === 'maintenance') {
      console.log(`Устройство ${deviceId} на обслуживании, пропускаем команду`);
      return;
    }
    
    // Критические команды имеют приоритет
    if (priority === 'critical') {
      await sendUrgentCommand(deviceId, command, parameters);
    } else {
      await sendCommand(deviceId, command, parameters);
    }
    
    // Ждем подтверждения выполнения
    await waitForCommandAck(deviceId, command.id);
    
    // Логируем для мониторинга
    await logDeviceOperation(deviceId, command, parameters, Date.now());
  }
};

async function* iotCommandQueue() {
  // Команды для одного устройства выполняются последовательно
  yield { targetId: 'conveyor_belt_01', data: { 
    deviceId: 'conveyor_belt_01', 
    command: { type: 'start', id: 'cmd_001' },
    parameters: { speed: 100 },
    priority: 'normal'
  }};
  
  yield { targetId: 'robot_arm_02', data: { 
    deviceId: 'robot_arm_02', 
    command: { type: 'move', id: 'cmd_002' },
    parameters: { x: 150, y: 200, z: 50 },
    priority: 'normal'
  }}; // Параллельно с конвейером
  
  // Экстренная остановка конвейера подождет запуска
  yield { targetId: 'conveyor_belt_01', data: { 
    deviceId: 'conveyor_belt_01', 
    command: { type: 'emergency_stop', id: 'cmd_003' },
    parameters: {},
    priority: 'critical'
  }};
}

await run(iotExecutor, iotCommandQueue(), 100);
```

### 🧠 Распределенное машинное обучение

```typescript
// Проблема: нельзя одновременно обновлять одну модель разными градиентами
// Решение: сериализация обновлений по model_id

const mlTrainingExecutor = {
  async executeTask(task) {
    const { modelId, gradients, batch, epoch, nodeId } = task.data;
    
    // Загружаем текущее состояние модели
    const currentModel = await loadModel(modelId);
    
    // Применяем градиенты
    const updatedWeights = await applyGradients(currentModel.weights, gradients);
    
    // Вычисляем метрики
    const metrics = await calculateMetrics(updatedWeights, batch);
    
    // Сохраняем обновленную модель
    await saveModel(modelId, {
      weights: updatedWeights,
      epoch: epoch,
      batch: batch,
      metrics: metrics,
      updatedBy: nodeId,
      timestamp: Date.now()
    });
    
    // Уведомляем другие узлы об обновлении
    await broadcastModelUpdate(modelId, metrics);
    
    console.log(`Модель ${modelId} обновлена узлом ${nodeId}, epoch ${epoch}, loss: ${metrics.loss}`);
  }
};

async function* trainingQueue() {
  // Обновления одной модели идут последовательно
  yield { targetId: 'model_nlp_v1', data: { 
    modelId: 'model_nlp_v1', 
    gradients: gradients_batch_1,
    batch: 1,
    epoch: 15,
    nodeId: 'gpu_node_1'
  }};
  
  yield { targetId: 'model_cv_v2', data: { 
    modelId: 'model_cv_v2', 
    gradients: gradients_batch_1,
    batch: 1,
    epoch: 8,
    nodeId: 'gpu_node_2'
  }}; // Параллельно
  
  // Следующий батч NLP модели подождет предыдущего
  yield { targetId: 'model_nlp_v1', data: { 
    modelId: 'model_nlp_v1', 
    gradients: gradients_batch_2,
    batch: 2,
    epoch: 15,
    nodeId: 'gpu_node_3'
  }};
}

await run(mlTrainingExecutor, trainingQueue(), 8); // 8 GPU узлов
```

## Лицензия

MIT
