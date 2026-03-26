import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

export function debug(...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.log(chalk.gray('[DEBUG]'), ...args);
  }
}

export function info(...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.INFO) {
    console.log(chalk.blue('[INFO]'), ...args);
  }
}

export function warn(...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.WARN) {
    console.log(chalk.yellow('[WARN]'), ...args);
  }
}

export function error(...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.ERROR) {
    console.log(chalk.red('[ERROR]'), ...args);
  }
}

export function success(...args: unknown[]): void {
  console.log(chalk.green('[SUCCESS]'), ...args);
}

export const logger = {
  debug,
  info,
  warn,
  error,
  success,
  setLogLevel,
};
