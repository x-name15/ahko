export { Ahko } from "./ahko.js";
export { VERSION } from "./version.js";

// Errors
export {
  AhkoError,
  AhkoCancellationError,
  AhkoConfigurationError,
  AhkoQueueError,
  AhkoTimeoutError,
  AhkoCircuitBreakerOpenError,
  type IAhkoTimeoutErrorOptions,
  type IAhkoCircuitBreakerErrorOptions,
} from "./errors/index.js";

// Models and interfaces
export {
  ETaskState,
  EScheduleStrategy,
  ECircuitState,
  TASK_PRIORITY_WEIGHTS,
  resolvePriorityWeight,
} from "./models/index.js";

export type {
  ITask,
  ITaskContext,
  IScheduleOptions,
  IAhkoOptions,
  IAhkoStats,
  TScheduleStrategy,
  IRetryOptions,
  TRetryBackoff,
  TRetryPredicate,
  IAhkoEventMap,
  TAhkoEventName,
  TAhkoEventHandler,
  TAhkoUnsubscribe,
  TCircuitState,
  ICircuitBreakerOptions,
  ICircuitBreakerStats,
  TTaskPriority,
  IAhkoFileConfig,
  IAhkoProfileConfig,
  IBatchOptions,
  IBatchMapOptions,
  IAdaptiveConcurrencyOptions,
  IAdaptiveStats,
} from "./models/index.js";

// Config utilities
export {
  loadConfig,
  resetConfig,
  loadConfigFile,
  getActiveConfig,
  getProfileConfig,
} from "./config/index.js";

// Circuit Breaker & Adaptive Coordinators
export { CircuitBreakerCoordinator } from "./scheduler/circuit-breaker.js";
export { AdaptiveCoordinator } from "./scheduler/adaptive-coordinator.js";

// Retry utilities
export {
  calculateBackoff,
  DEFAULT_BASE_DELAY,
  DEFAULT_MAX_DELAY,
} from "./retry/index.js";

// Signal utilities
export {
  combineSignals,
  type ICombinedSignal,
} from "./scheduler/signal.js";
