import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { TokenPayload } from '../../application/services/AuthService';
import { logger } from '../../infrastructure/logger';
import { setSentryUser } from '../../infrastructure/monitoring/sentry';

// ─── SEGURIDAD: El servidor NO puede arrancar sin JWT_SECRET configurado ──────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error(
        '[FATAL] JWT_SECRET no está configurado en las variables de entorno. ' +
        'El servidor no puede arrancar de forma segura. ' +
        'Configura JWT_SECRET en tu archivo .env'
    );
}

// Extender el tipo Request de Express para incluir el usuario autenticado
declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
        }
    }
}

/**
 * Middleware de autenticación JWT.
 * Verifica el token Bearer en el header Authorization, o si no viene, en la
 * cookie httpOnly `access_token` (que es como el navegador la envía para el
 * frontend web — el header Bearer sigue soportado para clientes que no son
 * el navegador: apps móviles, Postman, servicios que llaman a la API).
 * Si es válido, adjunta el payload al objeto request.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    const token = bearerToken || req.cookies?.access_token;

    if (!token) {
        res.status(401).json({ error: 'Acceso no autorizado. Se requiere token de autenticación.' });
        return;
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
        req.user = payload;
        setSentryUser({ id: payload.sub, email: payload.email, role: payload.role });
        next();
    } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Token expirado. Por favor inicia sesión nuevamente.' });
            return;
        }
        logger.warn(`Token inválido recibido: ${err.message}`);
        res.status(401).json({ error: 'Token inválido.' });
    }
};

/**
 * Middleware de autorización por roles.
 * Debe usarse DESPUÉS de authenticate.
 * @param roles - Lista de roles permitidos para acceder al recurso
 */
export const authorize = (...roles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'No autenticado.' });
            return;
        }

        if (!roles.includes(req.user.role)) {
            logger.warn(`Acceso denegado: usuario ${req.user.email} (${req.user.role}) intentó acceder a recurso restringido para [${roles.join(', ')}]`);
            res.status(403).json({
                error: `Acceso denegado. Se requiere uno de los siguientes roles: ${roles.join(', ')}.`,
            });
            return;
        }

        next();
    };
};

/**
 * Middleware que verifica que el usuario pertenece a la empresa del recurso.
 * Útil para endpoints B2B donde un admin solo puede ver su propia empresa.
 * Extrae companyId de req.params.companyId o req.body.companyId.
 */
export const authorizeCompany = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({ error: 'No autenticado.' });
        return;
    }

    // SUPER_ADMIN puede acceder a cualquier empresa
    if (req.user.role === UserRole.SUPER_ADMIN) {
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

/**
 * Middleware factory que verifica que un recurso YA EXISTENTE (identificado por
 * :id u otro parámetro) pertenece a la empresa del usuario autenticado, sin
 * depender de que el companyId venga en el body/params de la petición (que el
 * cliente podría omitir o falsificar). `resolveCompanyId` debe consultar el
 * recurso y devolver el companyId dueño (o null si no aplica restricción,
 * ej. un recurso sin empresa asociada). Si el recurso no existe, el error debe
 * incluir "no encontrad" para que se traduzca en un 404 en vez de un 500.
 */
export const authorizeOwnCompanyResource = (
    resolveCompanyId: (req: Request) => Promise<string | null | undefined>
) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            res.status(401).json({ error: 'No autenticado.' });
            return;
        }

        if (req.user.role === UserRole.SUPER_ADMIN) {
            next();
            return;
        }

        try {
            const ownerCompanyId = await resolveCompanyId(req);

            if (ownerCompanyId == null) {
                next();
                return;
            }

            if (req.user.companyId !== ownerCompanyId) {
                logger.warn(`Acceso denegado: usuario ${req.user.email} intentó acceder a un recurso de otra empresa`);
                res.status(403).json({ error: 'No tienes permisos para acceder a los recursos de esta empresa.' });
                return;
            }

            next();
        } catch (err: any) {
            if (err.message?.includes('no encontrad')) {
                res.status(404).json({ error: err.message });
                return;
            }
            next(err);
        }
    };
};
