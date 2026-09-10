'use strict';
function safeLogger(log) {
  return Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, (...args) => {
    try { const result = log[level](...args); if (result?.then) Promise.resolve(result).catch(() => {}); } catch { /* Logging must not replay actions. */ }
  }]));
}
function onceCallback(log, callback) {
  let settled = false;
  return (...args) => {
    if (settled) return;
    settled = true;
    try {
      const result = callback(...args);
      if (result?.then) Promise.resolve(result).catch(() => log.error('Script2 callback rejected.'));
    } catch { log.error('Script2 callback failed.'); }
  };
}
module.exports = { safeLogger, onceCallback };
