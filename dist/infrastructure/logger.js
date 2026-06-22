"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = require("winston");
const { combine, timestamp, colorize, printf, json } = winston_1.format;
const devFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
});
exports.logger = (0, winston_1.createLogger)({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), process.env.NODE_ENV === 'production'
        ? json()
        : combine(colorize(), devFormat)),
    transports: [
        new winston_1.transports.Console(),
        // En producción agregar: new transports.File({ filename: 'logs/error.log', level: 'error' })
    ],
});
//# sourceMappingURL=logger.js.map