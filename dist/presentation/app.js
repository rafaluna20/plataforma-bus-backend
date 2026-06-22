"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// Controllers
const AuthController_1 = __importDefault(require("./controllers/AuthController"));
const TripController_1 = __importDefault(require("./controllers/TripController"));
const BookingController_1 = __importDefault(require("./controllers/BookingController"));
const CompanyController_1 = __importDefault(require("./controllers/CompanyController"));
const VehicleController_1 = __importDefault(require("./controllers/VehicleController"));
const RouteController_1 = __importDefault(require("./controllers/RouteController"));
const TripManagementController_1 = __importDefault(require("./controllers/TripManagementController"));
const AdminController_1 = __importDefault(require("./controllers/AdminController"));
const PaymentController_1 = __importDefault(require("./controllers/PaymentController"));
// Middlewares
const auth_middleware_1 = require("./middlewares/auth.middleware");
const UserEntity_1 = require("../infrastructure/database/entities/UserEntity");
const logger_1 = require("../infrastructure/logger");
const swagger_1 = require("../infrastructure/swagger");
// Rate limiting global
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 200, // 200 peticiones por IP por ventana
    message: { error: 'Demasiadas peticiones desde esta IP. Intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health', // No limitar health check
});
class App {
    constructor() {
        this.express = (0, express_1.default)();
        this.middlewares();
        this.routes();
        (0, swagger_1.setupSwagger)(this.express); // Swagger UI en /api/docs
        this.errorHandling();
    }
    middlewares() {
        // Rate limiting global
        this.express.use(globalLimiter);
        // CORS configurado correctamente
        const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001,http://localhost:3002').split(',');
        this.express.use((0, cors_1.default)({
            origin: (origin, callback) => {
                // Permitir peticiones sin origin (ej. Postman, mobile apps)
                if (!origin)
                    return callback(null, true);
                if (allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }
                logger_1.logger.warn(`CORS bloqueado para origen: ${origin}`);
                // En desarrollo, permitir cualquier localhost
                if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
                    return callback(null, true);
                }
                return callback(new Error(`Origen ${origin} no permitido por CORS`));
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
            credentials: true, // Necesario para cookies HttpOnly
        }));
        // Parseo de cookies (para refresh token HttpOnly)
        this.express.use((0, cookie_parser_1.default)());
        // Parseo de JSON body
        this.express.use(express_1.default.json({ limit: '10mb' }));
        this.express.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        // Logging de peticiones HTTP
        this.express.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
                logger_1.logger[level](`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`, {
                    ip: req.ip,
                    userAgent: req.get('user-agent'),
                });
            });
            next();
        });
    }
    routes() {
        // Health Check (público)
        this.express.get('/health', (req, res) => {
            res.status(200).json({
                status: 'OK',
                message: 'Transport API is running',
                timestamp: new Date(),
                version: '2.0.0',
            });
        });
        // ==================== API v1 ====================
        // AUTH (público - login, register, refresh)
        this.express.use('/api/v1/auth', AuthController_1.default);
        // B2C: Búsqueda de viajes (público - cualquiera puede buscar)
        this.express.use('/api/v1/trips', TripController_1.default);
        // B2C: Reservas (requiere autenticación)
        this.express.use('/api/v1/bookings', auth_middleware_1.authenticate, BookingController_1.default);
        // B2C: Pagos con tarjeta y billetera digital (requiere autenticación)
        this.express.use('/api/v1/payments', auth_middleware_1.authenticate, PaymentController_1.default);
        // B2B: Gestión Empresarial (requiere ADMIN o SUPER_ADMIN)
        this.express.use('/api/v1/companies', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(UserEntity_1.UserRole.ADMIN, UserEntity_1.UserRole.SUPER_ADMIN), CompanyController_1.default);
        this.express.use('/api/v1/vehicles', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(UserEntity_1.UserRole.ADMIN, UserEntity_1.UserRole.SUPER_ADMIN), VehicleController_1.default);
        this.express.use('/api/v1/routes', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(UserEntity_1.UserRole.ADMIN, UserEntity_1.UserRole.SUPER_ADMIN), RouteController_1.default);
        this.express.use('/api/v1/management/trips', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(UserEntity_1.UserRole.ADMIN, UserEntity_1.UserRole.SUPER_ADMIN, UserEntity_1.UserRole.DRIVER), TripManagementController_1.default);
        // ADMIN PANEL: Gestión de usuarios y roles (SUPER_ADMIN + ADMIN)
        this.express.use('/api/v1/admin', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(UserEntity_1.UserRole.SUPER_ADMIN, UserEntity_1.UserRole.ADMIN), AdminController_1.default);
    }
    errorHandling() {
        // 404 handler
        this.express.use((req, res) => {
            res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
        });
        // Manejador global de errores (Centralizado)
        this.express.use((err, req, res, next) => {
            logger_1.logger.error(`[Error no manejado]: ${err.message}`, {
                stack: err.stack,
                path: req.path,
                method: req.method,
            });
            // No exponer detalles internos en producción
            res.status(500).json({
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? err.message : 'Ocurrió un error inesperado.',
            });
        });
    }
}
exports.default = new App().express;
//# sourceMappingURL=app.js.map