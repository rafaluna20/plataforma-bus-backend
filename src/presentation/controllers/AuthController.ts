import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../../application/services/AuthService';
import { authenticate } from '../middlewares/auth.middleware';
import { validateBody, RegisterSchema, LoginSchema } from '../validators/schemas';
import { isDevelopment } from '../../infrastructure/env';

const router = Router();
const authService = new AuthService();

// El access token vive SOLO en una cookie httpOnly — nunca en el JSON de
// respuesta ni en localStorage — para que un script inyectado (XSS) no pueda
// leerlo. 15 minutos, igual que JWT_EXPIRES_IN por defecto en AuthService.
const ACCESS_TOKEN_COOKIE_MAX_AGE = 15 * 60 * 1000;

const setAuthCookies = (res: Response, tokens: { accessToken: string; refreshToken: string }) => {
    res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        secure: true, // Debe ser true siempre para sameSite='none'
        sameSite: 'none',
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
    });
    res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: true, // Debe ser true siempre para sameSite='none'
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });
};

// Rate limiting estricto para endpoints de autenticación
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 15, // máximo 15 intentos por IP
    message: { error: 'Demasiados intentos de autenticación. Intenta de nuevo en 5 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
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
router.post('/register', registerLimiter, validateBody(RegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, email, password, docType, docNum, phone } = req.body;

        const tokens = await authService.register({ name, email, password, docType, docNum, phone });

        setAuthCookies(res, tokens);

        return res.status(201).json({
            message: 'Cuenta creada exitosamente',
            user: tokens.user,
        });
    } catch (error: any) {
        if (error.message?.includes('Ya existe')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('contraseña')) return res.status(400).json({ error: error.message });
        next(error);
    }
});

/**
 * POST /api/v1/auth/login
 * Iniciar sesión
 */
router.post('/login', authLimiter, validateBody(LoginSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;

        const tokens = await authService.login({ email, password });

        setAuthCookies(res, tokens);

        return res.status(200).json({
            message: 'Sesión iniciada exitosamente',
            user: tokens.user,
        });
    } catch (error: any) {
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
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Intentar obtener el refresh token de la cookie primero, luego del body
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token no proporcionado.' });
        }

        const tokens = await authService.refreshTokens(refreshToken);

        setAuthCookies(res, tokens);

        return res.status(200).json({
            user: tokens.user,
        });
    } catch (error: any) {
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
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        await authService.logout(req.user!.sub);

        // Limpiar cookies
        res.clearCookie('access_token', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        return res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/auth/me
 * Obtener perfil del usuario autenticado
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const profile = await authService.getProfile(req.user!.sub);
        return res.status(200).json(profile);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

export default router;
