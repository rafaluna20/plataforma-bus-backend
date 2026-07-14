import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AdminService } from '../../application/services/AdminService';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { validateBody, validateQuery } from '../validators/schemas';
import { AuditLogService } from '../../application/services/AuditLogService';
import { authorize } from '../middlewares/auth.middleware';


const router = Router();
const adminService = new AdminService();

// ─── Schemas de validación ────────────────────────────────────────────────────

const CreateStaffSchema = z.object({
    name: z.string().min(2).max(150).trim(),
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(100),
    companyId: z.string().uuid('companyId debe ser un UUID válido'),
    stationId: z.string().uuid('stationId debe ser un UUID válido').optional(),
    docType: z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).optional(),
    docNum: z.string().min(6).max(20).optional(),
    phone: z.string().regex(/^[0-9+\-\s()]{7,20}$/).optional(),
    // Solo relevante para conductores (Manifiesto de Pasajeros SUNAT/MTC)
    licenseNumber: z.string().max(30).optional(),
});

const UpdateStaffProfileSchema = z.object({
    name: z.string().min(2).max(150).trim().optional(),
    docType: z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).optional(),
    docNum: z.string().min(6).max(20).optional(),
    phone: z.string().regex(/^[0-9+\-\s()]{7,20}$/).optional(),
    licenseNumber: z.string().max(30).optional().nullable(),
    // Solo relevante para vendedores (Punto de venta); null = quitar asignación.
    stationId: z.string().uuid('stationId debe ser un UUID válido').optional().nullable(),
});

const UpdateRoleSchema = z.object({
    role: z.nativeEnum(UserRole, { error: `Rol inválido. Use: ${Object.values(UserRole).join(', ')}` }),
    companyId: z.string().uuid('companyId debe ser un UUID válido').optional(),
});

const ListUsersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    role: z.nativeEnum(UserRole).optional(),
    companyId: z.string().uuid().optional(),
    search: z.string().min(2).max(100).optional(),
});

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/users/admin
 * Crear un usuario con rol ADMIN vinculado a una empresa.
 * Solo SUPER_ADMIN puede ejecutar este endpoint.
 */
router.post('/users/admin', authorize(UserRole.SUPER_ADMIN), validateBody(CreateStaffSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await adminService.createAdmin(req.body);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'CREATE_ADMIN_USER',
            entityName: 'UserEntity',
            entityId: user.id,
            newValue: { email: user.email, companyId: req.body.companyId },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(201).json({
            message: 'Usuario ADMIN creado exitosamente',
            user,
        });
    } catch (error: any) {
        if (error.message?.includes('Ya existe')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * POST /api/v1/admin/users/driver
 * Crear un usuario con rol DRIVER vinculado a una empresa.
 * SUPER_ADMIN o ADMIN de la empresa pueden ejecutar este endpoint.
 */
router.post('/users/driver', validateBody(CreateStaffSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Si es ADMIN (no SUPER_ADMIN), solo puede crear drivers de su propia empresa
        if (req.user?.role === UserRole.ADMIN && req.user.companyId !== req.body.companyId) {
            return res.status(403).json({ error: 'Solo puedes crear conductores para tu propia empresa' });
        }

        const user = await adminService.createDriver(req.body);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'CREATE_DRIVER_USER',
            entityName: 'UserEntity',
            entityId: user.id,
            newValue: { email: user.email, companyId: req.body.companyId },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(201).json({
            message: 'Usuario DRIVER creado exitosamente',
            user,
        });
    } catch (error: any) {
        if (error.message?.includes('Ya existe')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('no encontrada')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * POST /api/v1/admin/users/seller
 * Crear un usuario con rol AGENCY_SELLER (vendedor) vinculado a una empresa y opcionalmente a un paradero.
 * SUPER_ADMIN o ADMIN de la empresa pueden ejecutar este endpoint.
 */
router.post('/users/seller', validateBody(CreateStaffSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Si es ADMIN (no SUPER_ADMIN), solo puede crear vendedores de su propia empresa
        if (req.user?.role === UserRole.ADMIN && req.user.companyId !== req.body.companyId) {
            return res.status(403).json({ error: 'Solo puedes crear vendedores para tu propia empresa' });
        }

        const user = await adminService.createSeller(req.body);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'CREATE_SELLER_USER',
            entityName: 'UserEntity',
            entityId: user.id,
            newValue: { email: user.email, companyId: req.body.companyId, stationId: req.body.stationId },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(201).json({
            message: 'Usuario SELLER creado exitosamente',
            user,
        });
    } catch (error: any) {
        if (error.message?.includes('Ya existe')) return res.status(409).json({ error: error.message });
        if (error.message?.includes('no encontrada') || error.message?.includes('Paradero')) return res.status(404).json({ error: error.message });
        next(error);
    }
});

/**
 * PATCH /api/v1/admin/users/:id/role
 * Cambiar el rol de un usuario existente.
 * Solo SUPER_ADMIN puede cambiar roles.
 */
router.patch('/users/:id/role', validateBody(UpdateRoleSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.id as string;
        const user = await adminService.updateUserRole({
            userId,
            role: req.body.role,
            companyId: req.body.companyId,
            actorRole: req.user?.role,
            actorCompanyId: req.user?.companyId,
        });

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'UPDATE_USER_ROLE',
            entityName: 'UserEntity',
            entityId: userId,
            newValue: { role: req.body.role, companyId: req.body.companyId },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({
            message: `Rol actualizado a ${req.body.role}`,
            user,
        });
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('SUPER_ADMIN') || error.message?.includes('propia empresa')) {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * PATCH /api/v1/admin/users/:id
 * Actualizar datos de perfil de un usuario de staff (nombre, teléfono,
 * documento, N° de licencia). No cambia email/password/rol.
 * SUPER_ADMIN puede editar a cualquiera; ADMIN solo a staff de su propia empresa.
 */
router.patch('/users/:id', validateBody(UpdateStaffProfileSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.id as string;
        const user = await adminService.updateUserProfile(userId, req.body, req.user?.role, req.user?.companyId);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'UPDATE_USER_PROFILE',
            entityName: 'UserEntity',
            entityId: userId,
            newValue: req.body,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json({ message: 'Perfil actualizado exitosamente', user });
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('SUPER_ADMIN') || error.message?.includes('ADMIN') || error.message?.includes('propia empresa')) {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * PATCH /api/v1/admin/users/:id/status
 * Activar o desactivar una cuenta de usuario.
 * Solo SUPER_ADMIN puede ejecutar este endpoint.
 */
router.patch('/users/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'Campo requerido: isActive (boolean)' });
        }

        const userId = req.params.id as string;
        const result = await adminService.toggleUserStatus(userId, isActive, req.user?.role, req.user?.companyId);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'TOGGLE_USER_STATUS',
            entityName: 'UserEntity',
            entityId: userId,
            newValue: { isActive },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json(result);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('ADMIN') || error.message?.includes('propia empresa')) {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * PATCH /api/v1/admin/users/:id/activate
 * Activar una cuenta de usuario (alias conveniente para el panel).
 * Solo SUPER_ADMIN puede ejecutar este endpoint.
 */
router.patch('/users/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.id as string;
        const result = await adminService.toggleUserStatus(userId, true, req.user?.role, req.user?.companyId);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'TOGGLE_USER_STATUS',
            entityName: 'UserEntity',
            entityId: userId,
            newValue: { isActive: true },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json(result);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('ADMIN') || error.message?.includes('propia empresa')) {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * PATCH /api/v1/admin/users/:id/deactivate
 * Desactivar una cuenta de usuario (alias conveniente para el panel).
 * Solo SUPER_ADMIN puede ejecutar este endpoint.
 */
router.patch('/users/:id/deactivate', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.id as string;
        const result = await adminService.toggleUserStatus(userId, false, req.user?.role, req.user?.companyId);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'TOGGLE_USER_STATUS',
            entityName: 'UserEntity',
            entityId: userId,
            newValue: { isActive: false },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json(result);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('ADMIN') || error.message?.includes('propia empresa')) {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * PATCH /api/v1/admin/users/:id/toggle
 * Alternar el estado isActive de un usuario.
 * SUPER_ADMIN puede hacerlo con cualquier usuario.
 * ADMIN puede hacerlo solo con vendedores (AGENCY_SELLER) de su propia empresa.
 */
router.patch('/users/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.id as string;
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'Campo requerido: isActive (boolean)' });
        }
        const result = await adminService.toggleUserStatus(userId, isActive, req.user?.role, req.user?.companyId);

        await AuditLogService.log({
            userId: req.user?.sub,
            userEmail: req.user?.email,
            action: 'TOGGLE_USER_STATUS',
            entityName: 'UserEntity',
            entityId: userId,
            newValue: { isActive },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        return res.status(200).json(result);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('ADMIN') || error.message?.includes('propia empresa')) {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * GET /api/v1/admin/users
 * Listar todos los usuarios con paginación y filtros.
 * SUPER_ADMIN ve todos. ADMIN solo ve usuarios de su empresa.
 * Query params: ?page=1&limit=20&role=PASSENGER&companyId=uuid&search=nombre
 */
router.get('/users', validateQuery(ListUsersQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = (req as any).validatedQuery;

        // ADMIN solo puede ver usuarios de su empresa
        if (req.user?.role === UserRole.ADMIN) {
            query.companyId = req.user.companyId;
        }

        const result = await adminService.listUsers(query);
        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/admin/stats
 * Estadísticas del sistema: total usuarios, por rol, empresas activas.
 * Solo SUPER_ADMIN.
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const stats = await adminService.getSystemStats();
        return res.status(200).json(stats);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/v1/admin/audit-logs
 * Obtener bitácora de auditoría del sistema
 * Accesible para SUPER_ADMIN y ADMIN
 */
router.get('/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const result = await AuditLogService.getLogs(page, limit);
        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

export default router;

