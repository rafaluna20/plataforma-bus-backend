import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AdminService } from '../../application/services/AdminService';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { validateBody, validateQuery } from '../validators/schemas';

const router = Router();
const adminService = new AdminService();

// ─── Schemas de validación ────────────────────────────────────────────────────

const CreateStaffSchema = z.object({
    name: z.string().min(2).max(150).trim(),
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(100),
    companyId: z.string().uuid('companyId debe ser un UUID válido'),
    docType: z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).optional(),
    docNum: z.string().min(6).max(20).optional(),
    phone: z.string().regex(/^[0-9+\-\s()]{7,20}$/).optional(),
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
router.post('/users/admin', validateBody(CreateStaffSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await adminService.createAdmin(req.body);
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
        });
        return res.status(200).json({
            message: `Rol actualizado a ${req.body.role}`,
            user,
        });
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('SUPER_ADMIN')) return res.status(403).json({ error: error.message });
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
        const result = await adminService.toggleUserStatus(userId, isActive);
        return res.status(200).json(result);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('SUPER_ADMIN')) return res.status(403).json({ error: error.message });
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
        const result = await adminService.toggleUserStatus(userId, true);
        return res.status(200).json(result);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('SUPER_ADMIN')) return res.status(403).json({ error: error.message });
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
        const result = await adminService.toggleUserStatus(userId, false);
        return res.status(200).json(result);
    } catch (error: any) {
        if (error.message?.includes('no encontrado')) return res.status(404).json({ error: error.message });
        if (error.message?.includes('SUPER_ADMIN')) return res.status(403).json({ error: error.message });
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

export default router;
