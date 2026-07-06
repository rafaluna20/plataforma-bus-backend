import { createLogger, format, transports } from 'winston';
import { isDevelopment } from './env';

const { combine, timestamp, colorize, printf, json } = format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
});

export const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        isDevelopment
            ? combine(colorize(), devFormat)
            : json()
    ),
    transports: [
        new transports.Console(),
        // En producción agregar: new transports.File({ filename: 'logs/error.log', level: 'error' })
    ],
});
