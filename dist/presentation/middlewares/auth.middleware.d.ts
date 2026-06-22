import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { TokenPayload } from '../../application/services/AuthService';
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
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Middleware de autorización por roles.
 * Debe usarse DESPUÉS de authenticate.
 * @param roles - Lista de roles permitidos para acceder al recurso
 */
export declare const authorize: (...roles: UserRole[]) => (req: Request, res: Response, next: NextFunction) => void;
/**
 * Middleware que verifica que el usuario pertenece a la empresa del recurso.
 * Útil para endpoints B2B donde un admin solo puede ver su propia empresa.
 * Extrae companyId de req.params.companyId o req.body.companyId.
 */
export declare const authorizeCompany: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.middleware.d.ts.map