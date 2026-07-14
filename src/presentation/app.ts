import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { randomUUID } from 'crypto';

// Extender Express Request para incluir Correlation ID
declare global {
    namespace Express {
        interface Request {
            correlationId?: string;
        }
    }
}


// Controllers
import authRoutes from './controllers/AuthController';
import companyRoutes from './controllers/CompanyController';
import vehicleRoutes from './controllers/VehicleController';
import routeRoutes from './controllers/RouteController';
import adminRoutes from './controllers/AdminController';
import brandingRoutes from './controllers/CompanyBrandingController';
import fareRuleRoutes from './controllers/FareRuleController';
import { parcelRoutes } from '../modules/parcels';
import { tripRoutes, tripMgmtRoutes } from '../modules/trips';
import { bookingRoutes } from '../modules/bookings';
import { paymentRoutes } from '../modules/payments';

// Middlewares
import { authenticate, authorize } from './middlewares/auth.middleware';
import { UserRole } from '../infrastructure/database/entities/UserEntity';
import { logger } from '../infrastructure/logger';
import { setupSwagger } from '../infrastructure/swagger';
import { captureError } from '../infrastructure/monitoring/sentry';
import { healthRouter } from '../infrastructure/monitoring/healthcheck';
import { isDevelopment } from '../infrastructure/env';

// Rate limiting global — por IP, cubre toda la API (incluida la pública).
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 200, // 200 peticiones por IP por ventana
    message: { error: 'Demasiadas peticiones desde esta IP. Intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/health'), // No limitar health check (incluye /health/ready y /health/live)
});

/**
 * Rate limiting por empresa — se agrega DESPUÉS de `authenticate` en las rutas
 * de gestión B2B (companies, vehicles, routes, management/trips, admin,
 * parcels), donde req.user.companyId ya está disponible. Sin esto, el límite
 * global de arriba es por IP: una integración/bot mal configurado de UNA
 * empresa podía agotar el cupo compartido de todas las demás empresas detrás
 * del mismo NAT/proxy. SUPER_ADMIN no tiene companyId — cae al límite por IP
 * (ipKeyGenerator normaliza IPv6 para no fragmentar el conteo por /64).
 */
const companyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.COMPANY_RATE_LIMIT_MAX || '500'),
    message: { error: 'Tu empresa alcanzó el límite de peticiones a la API. Intenta de nuevo en unos minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.companyId || ipKeyGenerator(req.ip!),
});

class App {
    public express: Application;

    constructor() {
        this.express = express();
        this.middlewares();
        this.routes();
        setupSwagger(this.express); // Swagger UI en /api/docs
        this.errorHandling();
    }

    private middlewares(): void {
        // 0. Cabeceras de seguridad HTTP (helmet). CSP desactivado porque
        // Swagger UI (/api/docs) usa scripts/estilos inline que el CSP por
        // defecto de helmet bloquearía; ajustar una política a medida es
        // trabajo aparte si se quiere endurecer también esa página.
        // crossOriginResourcePolicy en 'cross-origin' porque esta API la
        // consume el frontend desde otro origen (Vercel), no el mismo host.
        this.express.use(helmet({
            contentSecurityPolicy: false,
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }));

        // 1. CORS configurado correctamente (SIEMPRE antes del rate limiter)
        const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001,http://localhost:3002').split(',').map(o => o.trim());
        this.express.use(cors({
            origin: (origin, callback) => {
                // Permitir peticiones sin origin (ej. Postman, mobile apps)
                if (!origin) return callback(null, true);
                // Solo en desarrollo local confirmado, permitir cualquier localhost
                // sin warnings (isDevelopment, no "!== production": un NODE_ENV mal
                // configurado no debe relajar CORS por accidente).
                if (isDevelopment && origin.startsWith('http://localhost')) {
                    return callback(null, true);
                }
                if (allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }
                logger.warn(`CORS bloqueado para origen: ${origin}`);
                return callback(new Error(`Origen ${origin} no permitido por CORS`));
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
            credentials: true, // Necesario para cookies HttpOnly
        }));

        // 2. Rate limiting global
        this.express.use(globalLimiter);

        // Parseo de cookies (para refresh token HttpOnly)
        this.express.use(cookieParser());

        // Parseo de JSON body
        this.express.use(express.json({ limit: '10mb' }));
        this.express.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Middleware de Correlation ID
        this.express.use((req: Request, res: Response, next: NextFunction) => {
            const correlationId = (req.header('x-correlation-id') || randomUUID()) as string;
            req.correlationId = correlationId;
            res.setHeader('x-correlation-id', correlationId);
            next();
        });

        // Logging de peticiones HTTP
        this.express.use((req: Request, res: Response, next: NextFunction) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
                logger[level](`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`, {
                    ip: req.ip,
                    userAgent: req.get('user-agent'),
                    correlationId: req.correlationId,
                });
            });
            next();
        });
    }

    private routes(): void {
        // Health Check (público) — verifica BD y memoria de verdad; expone
        // /health, /health/ready y /health/live para Docker HEALTHCHECK /
        // probes de Kubernetes (ver infrastructure/monitoring/healthcheck.ts).
        this.express.use('/health', healthRouter);

        // ==================== API v1 ====================

        // AUTH (público - login, register, refresh)
        this.express.use('/api/v1/auth', authRoutes);

        // B2C: Búsqueda de viajes (público - cualquiera puede buscar)
        this.express.use('/api/v1/trips', tripRoutes);

        // B2C: Reservas (requiere autenticación)
        this.express.use('/api/v1/bookings', authenticate, bookingRoutes);

        // B2C: Pagos con tarjeta y billetera digital (requiere autenticación)
        this.express.use('/api/v1/payments', authenticate, paymentRoutes);

        // B2B: Gestión Empresarial (requiere ADMIN o SUPER_ADMIN)
        this.express.use(
            '/api/v1/companies',
            authenticate,
            companyLimiter,
            authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
            companyRoutes
        );
        this.express.use(
            '/api/v1/vehicles',
            authenticate,
            companyLimiter,
            authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
            vehicleRoutes
        );
        this.express.use(
            '/api/v1/routes',
            authenticate,
            companyLimiter,
            authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
            routeRoutes
        );
        // Tarifas dinámicas por franja horaria / fecha especial (feriados)
        this.express.use(
            '/api/v1/fare-rules',
            authenticate,
            companyLimiter,
            authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
            fareRuleRoutes
        );
        // AGENCY_SELLER incluido para poder autorizar el abordaje (PATCH /:id/status);
        // las demás rutas (crear/reprogramar/listar) restringen el rol internamente.
        this.express.use(
            '/api/v1/management/trips',
            authenticate,
            companyLimiter,
            authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DRIVER, UserRole.AGENCY_SELLER),
            tripMgmtRoutes
        );

        // ADMIN PANEL: Gestión de usuarios y roles (SUPER_ADMIN + ADMIN)
        this.express.use(
            '/api/v1/admin',
            authenticate,
            companyLimiter,
            authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN),
            adminRoutes
        );

        // ENCOMIENDAS: Gestión de paquetes/encomiendas por viaje (ADMIN, SUPER_ADMIN, AGENCY_SELLER)
        this.express.use(
            '/api/v1/parcels',
            authenticate,
            companyLimiter,
            authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENCY_SELLER),
            parcelRoutes
        );

        // BRANDING: Endpoints públicos (slug, public) + protegidos (me)
        this.express.use('/api/v1/branding', brandingRoutes);
    }

    private errorHandling(): void {
        // 404 handler
        this.express.use((req: Request, res: Response) => {
            res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
        });

        // Manejador global de errores (Centralizado)
        this.express.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            captureError(err, {
                path: req.path,
                method: req.method,
                correlationId: req.correlationId,
            });

            // No exponer detalles internos en producción
            res.status(500).json({
                error: 'Internal Server Error',
                message: isDevelopment ? err.message : 'Ocurrió un error inesperado.',
                correlationId: req.correlationId, // Devolver ID de tracking al cliente para reporte de bugs
            });
        });
    }
}

export default new App().express;
