"use strict";
/**
 * Endpoint de health check para monitoreo de infraestructura.
 * Compatible con Docker HEALTHCHECK, Kubernetes liveness/readiness probes,
 * AWS ALB, nginx upstream checks, etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const data_source_1 = require("../database/data-source");
const logger_1 = require("../logger");
exports.healthRouter = (0, express_1.Router)();
/**
 * GET /health
 * Health check básico (sin autenticación).
 * Retorna 200 si todo está bien, 503 si hay problemas críticos.
 */
exports.healthRouter.get('/', async (_req, res) => {
    const startTime = Date.now();
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        checks: {
            database: { status: 'ok' },
            memory: { status: 'ok' },
        },
    };
    // ─── Check: Base de datos ──────────────────────────────────────────────────
    try {
        const dbStart = Date.now();
        if (!data_source_1.AppDataSource.isInitialized) {
            health.checks.database = {
                status: 'error',
                message: 'Base de datos no inicializada',
            };
            health.status = 'down';
        }
        else {
            await data_source_1.AppDataSource.query('SELECT 1');
            health.checks.database = {
                status: 'ok',
                latencyMs: Date.now() - dbStart,
            };
        }
    }
    catch (err) {
        health.checks.database = {
            status: 'error',
            message: 'No se puede conectar a la base de datos',
        };
        health.status = 'down';
        logger_1.logger.error('Health check: DB error', { error: err.message });
    }
    // ─── Check: Memoria ────────────────────────────────────────────────────────
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    health.checks.memory = {
        status: heapPercent > 90 ? 'warn' : 'ok',
        details: {
            heapUsedMB,
            heapTotalMB,
            heapPercent: `${heapPercent}%`,
            rssMB: Math.round(memUsage.rss / 1024 / 1024),
        },
    };
    if (heapPercent > 90 && health.status === 'ok') {
        health.status = 'degraded';
    }
    const totalLatencyMs = Date.now() - startTime;
    const httpStatus = health.status === 'down' ? 503 : 200;
    logger_1.logger.info(`Health check: ${health.status} (${totalLatencyMs}ms)`);
    res.status(httpStatus).json(health);
});
/**
 * GET /health/ready
 * Readiness probe: indica si la app está lista para recibir tráfico.
 * Kubernetes usa esto para decidir si enviar peticiones al pod.
 */
exports.healthRouter.get('/ready', async (_req, res) => {
    try {
        if (!data_source_1.AppDataSource.isInitialized) {
            res.status(503).json({ ready: false, reason: 'Database not initialized' });
            return;
        }
        await data_source_1.AppDataSource.query('SELECT 1');
        res.status(200).json({ ready: true });
    }
    catch {
        res.status(503).json({ ready: false, reason: 'Database unreachable' });
    }
});
/**
 * GET /health/live
 * Liveness probe: indica si el proceso está vivo (no en deadlock).
 * Kubernetes usa esto para decidir si reiniciar el pod.
 */
exports.healthRouter.get('/live', (_req, res) => {
    res.status(200).json({ alive: true, uptime: Math.floor(process.uptime()) });
});
//# sourceMappingURL=healthcheck.js.map