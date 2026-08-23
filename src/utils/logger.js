/**
 * Logger - Leveled logging for library and application code.
 * Defaults to 'warn' so progress chatter stays out of production paths;
 * tests and development can raise verbosity via setLogLevel or OLLIE_LOG_LEVEL.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function initialLevel() {
    if (typeof process !== 'undefined' && process.env && process.env.OLLIE_LOG_LEVEL) {
        const requested = process.env.OLLIE_LOG_LEVEL.toLowerCase();
        if (LEVELS[requested] !== undefined) return LEVELS[requested];
    }
    return LEVELS.warn;
}

let currentLevel = initialLevel();

/**
 * Sets the minimum level that will be emitted.
 *
 * @param {'debug'|'info'|'warn'|'error'|'silent'} level
 */
export function setLogLevel(level) {
    if (LEVELS[level] === undefined) {
        throw new Error(`Unknown log level: ${level}`);
    }
    currentLevel = LEVELS[level];
}

function emit(level, sink, args) {
    if (currentLevel <= LEVELS[level]) {
        sink(...args);
    }
}

export const logger = {
    debug: (...args) => emit('debug', console.log, args),
    info: (...args) => emit('info', console.info, args),
    warn: (...args) => emit('warn', console.warn, args),
    error: (...args) => emit('error', console.error, args)
};
