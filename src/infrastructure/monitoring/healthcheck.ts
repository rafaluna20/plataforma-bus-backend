/**
 * Endpoint de health check para monitoreo de infraestructura.
 * Compatible con Docker HEALTHCHECK, Kubernetes liveness/readiness probes,
 * AWS ALB, nginx upstream checks, etc.
 */

import { Router, Request, Response } from 'express';
import { AppDataSource } from '../database/data-source';
import { logger } from '../logger';

export const healthRouter = Router();

interface HealthStatus {
    status: 'ok' | 'degraded' | 'down';
    timestamp: string;
    uptime: number;
    version: string;
    environment: string;
    checks: {
        database: CheckResult;
        memory: CheckResult;
    };
}

interface CheckResult {
    status: 'ok' | 'warn' | 'error';
    latencyMs?: number;
    message?: string;
    details?: Record<string, unknown>;
}

/**
 * GET /health
 * Health check básico (sin autenticación).
 * Retorna 200 si todo está bien, 503 si hay problemas críticos.
 */
healthRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    const health: HealthStatus = {
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
        if (!AppDataSource.isInitialized) {
            health.checks.database = {
                status: 'error',
                message: 'Base de datos no inicializada',
            };
            health.status = 'down';
        } else {
            await AppDataSource.query('SELECT 1');
            health.checks.database = {
                status: 'ok',
                latencyMs: Date.now() - dbStart,
            };
        }
    } catch (err) {
        health.checks.database = {
            status: 'error',
            message: 'No se puede conectar a la base de datos',
        };
        health.status = 'down';
        logger.error('Health check: DB error', { error: (err as Error).message });
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

    logger.info(`Health check: ${health.status} (${totalLatencyMs}ms)`);

    res.status(httpStatus).json(health);
});

/**
 * GET /health/ready
 * Readiness probe: indica si la app está lista para recibir tráfico.
 * Kubernetes usa esto para decidir si enviar peticiones al pod.
 */
healthRouter.get('/ready', async (_req: Request, res: Response): Promise<void> => {
    try {
        if (!AppDataSource.isInitialized) {
            res.status(503).json({ ready: false, reason: 'Database not initialized' });
            return;
        }
        await AppDataSource.query('SELECT 1');
        res.status(200).json({ ready: true });
    } catch {
        res.status(503).json({ ready: false, reason: 'Database unreachable' });
    }
});

/**
 * GET /health/live
 * Liveness probe: indica si el proceso está vivo (no en deadlock).
 * Kubernetes usa esto para decidir si reiniciar el pod.
 */
healthRouter.get('/live', (_req: Request, res: Response): void => {
    res.status(200).json({ alive: true, uptime: Math.floor(process.uptime()) });
});
