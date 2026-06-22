import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { TokenPayload } from '../../application/services/AuthService';
import { logger } from '../../infrastructure/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';

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
 * Verifica el token Bearer en el header Authorization.
 * Si es válido, adjunta el payload al objeto request.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Acceso no autorizado. Se requiere token de autenticación.' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
        req.user = payload;
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
