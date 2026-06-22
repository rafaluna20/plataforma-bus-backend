"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeCompany = exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const UserEntity_1 = require("../../infrastructure/database/entities/UserEntity");
const logger_1 = require("../../infrastructure/logger");
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
/**
 * Middleware de autenticación JWT.
 * Verifica el token Bearer en el header Authorization.
 * Si es válido, adjunta el payload al objeto request.
 */
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Acceso no autorizado. Se requiere token de autenticación.' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    }
    catch (err) {
        if (err.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Token expirado. Por favor inicia sesión nuevamente.' });
            return;
        }
        logger_1.logger.warn(`Token inválido recibido: ${err.message}`);
        res.status(401).json({ error: 'Token inválido.' });
    }
};
exports.authenticate = authenticate;
/**
 * Middleware de autorización por roles.
 * Debe usarse DESPUÉS de authenticate.
 * @param roles - Lista de roles permitidos para acceder al recurso
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'No autenticado.' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            logger_1.logger.warn(`Acceso denegado: usuario ${req.user.email} (${req.user.role}) intentó acceder a recurso restringido para [${roles.join(', ')}]`);
            res.status(403).json({
                error: `Acceso denegado. Se requiere uno de los siguientes roles: ${roles.join(', ')}.`,
            });
            return;
        }
        next();
    };
};
exports.authorize = authorize;
/**
 * Middleware que verifica que el usuario pertenece a la empresa del recurso.
 * Útil para endpoints B2B donde un admin solo puede ver su propia empresa.
 * Extrae companyId de req.params.companyId o req.body.companyId.
 */
const authorizeCompany = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ error: 'No autenticado.' });
        return;
    }
    // SUPER_ADMIN puede acceder a cualquier empresa
    if (req.user.role === UserEntity_1.UserRole.SUPER_ADMIN) {
        next();
        return;
    }
    const requestedCompanyId = req.params.companyId || req.body.companyId;
    if (!requestedCompanyId) {
        next(); // Si no hay companyId en la ruta, dejar pasar (el servicio validará)
        return;
    }
    if (req.user.companyId !== requestedCompanyId) {
        res.status(403).json({ error: 'No tienes permisos para acceder a los recursos de esta empresa.' });
        return;
    }
    next();
};
exports.authorizeCompany = authorizeCompany;
//# sourceMappingURL=auth.middleware.js.map