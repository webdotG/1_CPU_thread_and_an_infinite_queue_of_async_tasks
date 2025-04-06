import { IExecutor } from './Executor';
import ITask from './Task';

export default async function run(
  executor: IExecutor,
  queue: AsyncIterable<ITask>,
  maxThreads = 0
) {
  maxThreads = Math.max(0, maxThreads);
  const concurrencyLimit = maxThreads > 0 ? maxThreads : Infinity;

  const activeTargets = new Set<number>();
  const activePromises = new Set<Promise<void>>();
  const pendingTasks = new Map<number, ITask[]>();
  const iterator = queue[Symbol.asyncIterator]();

  const executeTask = async (task: ITask) => {
    activeTargets.add(task.targetId);
    const promise = executor.executeTask(task);
    activePromises.add(promise);
    try {
      await promise;
    } finally {
      activeTargets.delete(task.targetId);
      activePromises.delete(promise);
      processNext();
    }
  };

  const processNext = async () => {
    while (true) {
      // БЛОК 1: Запуск задач из pendingTasks
      while (activePromises.size < concurrencyLimit && pendingTasks.size > 0) {
        let taskToExecute: ITask | null = null;
        for (const [targetId, tasks] of pendingTasks) {
          if (!activeTargets.has(targetId) && tasks.length > 0) {
            taskToExecute = tasks.shift()!;
            if (tasks.length === 0) pendingTasks.delete(targetId);
            break;
          }
        }
        if (taskToExecute) {
          executeTask(taskToExecute);
          continue;
        }
        break;
      }

      // БЛОК 2: Обработка новых задач из итератора и завершение
      if (activePromises.size < concurrencyLimit || pendingTasks.size === 0) {
        const result = await iterator.next();
        if (!result.done) {
          const task = result.value;
          if (!activeTargets.has(task.targetId) && activePromises.size < concurrencyLimit) {
            executeTask(task);
          } else {
            const tasks = pendingTasks.get(task.targetId) || [];
            tasks.push(task);
            pendingTasks.set(task.targetId, tasks);
          }
          continue;
        }
        if (activePromises.size === 0 && pendingTasks.size === 0) {
          return; // Завершение, если очередь исчерпана и нет задач
        }
      }

      // БЛОК 3: Ожидание активных задач
      await Promise.race(activePromises);
    }
  };

  await processNext();
}