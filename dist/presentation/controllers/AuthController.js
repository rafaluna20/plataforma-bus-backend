"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const AuthService_1 = require("../../application/services/AuthService");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const schemas_1 = require("../validators/schemas");
const router = (0, express_1.Router)();
const authService = new AuthService_1.AuthService();
// Rate limiting estricto para endpoints de autenticación
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máximo 10 intentos por IP
    message: { error: 'Demasiados intentos de autenticación. Intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const registerLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5, // máximo 5 registros por IP por hora
    message: { error: 'Demasiados registros desde esta IP. Intenta de nuevo en 1 hora.' },
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * POST /api/v1/auth/register
 * Registrar un nuevo usuario (pasajero por defecto)
 */
router.post('/register', registerLimiter, (0, schemas_1.validateBody)(schemas_1.RegisterSchema), async (req, res, next) => {
    try {
        const { name, email, password, docType, docNum, phone } = req.body;
        const tokens = await authService.register({ name, email, password, docType, docNum, phone });
        // Enviar refresh token como cookie HttpOnly segura
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
        });
        return res.status(201).json({
            message: 'Cuenta creada exitosamente',
            accessToken: tokens.accessToken,
            user: tokens.user,
        });
    }
    catch (error) {
        if (error.message?.includes('Ya existe'))
            return res.status(409).json({ error: error.message });
        if (error.message?.includes('contraseña'))
            return res.status(400).json({ error: error.message });
        next(error);
    }
});
/**
 * POST /api/v1/auth/login
 * Iniciar sesión
 */
router.post('/login', authLimiter, (0, schemas_1.validateBody)(schemas_1.LoginSchema), async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const tokens = await authService.login({ email, password });
        // Enviar refresh token como cookie HttpOnly
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        return res.status(200).json({
            message: 'Sesión iniciada exitosamente',
            accessToken: tokens.accessToken,
            user: tokens.user,
        });
    }
    catch (error) {
        if (error.message?.includes('Credenciales') || error.message?.includes('desactivada')) {
            return res.status(401).json({ error: error.message });
        }
        next(error);
    }
});
/**
 * POST /api/v1/auth/refresh
 * Renovar access token usando refresh token (desde cookie o body)
 */
router.post('/refresh', async (req, res, next) => {
    try {
        // Intentar obtener el refresh token de la cookie primero, luego del body
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token no proporcionado.' });
        }
        const tokens = await authService.refreshTokens(refreshToken);
        // Renovar la cookie
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        return res.status(200).json({
            accessToken: tokens.accessToken,
            user: tokens.user,
        });
    }
    catch (error) {
        if (error.message?.includes('inválido') || error.message?.includes('expirado') || error.message?.includes('revocado')) {
            return res.status(401).json({ error: error.message });
        }
        next(error);
    }
});
/**
 * POST /api/v1/auth/logout
 * Cerrar sesión (revocar refresh token)
 */
router.post('/logout', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        await authService.logout(req.user.sub);
        // Limpiar cookie
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        });
        return res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /api/v1/auth/me
 * Obtener perfil del usuario autenticado
 */
router.get('/me', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const profile = await authService.getProfile(req.user.sub);
        return res.status(200).json(profile);
    }
    catch (error) {
        if (error.message?.includes('no encontrado'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=AuthController.js.map