"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const AdminService_1 = require("../../application/services/AdminService");
const UserEntity_1 = require("../../infrastructure/database/entities/UserEntity");
const schemas_1 = require("../validators/schemas");
const router = (0, express_1.Router)();
const adminService = new AdminService_1.AdminService();
// ─── Schemas de validación ────────────────────────────────────────────────────
const CreateStaffSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(150).trim(),
    email: zod_1.z.string().email().toLowerCase(),
    password: zod_1.z.string().min(8).max(100),
    companyId: zod_1.z.string().uuid('companyId debe ser un UUID válido'),
    docType: zod_1.z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).optional(),
    docNum: zod_1.z.string().min(6).max(20).optional(),
    phone: zod_1.z.string().regex(/^[0-9+\-\s()]{7,20}$/).optional(),
});
const UpdateRoleSchema = zod_1.z.object({
    role: zod_1.z.nativeEnum(UserEntity_1.UserRole, { error: `Rol inválido. Use: ${Object.values(UserEntity_1.UserRole).join(', ')}` }),
    companyId: zod_1.z.string().uuid('companyId debe ser un UUID válido').optional(),
});
const ListUsersQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
    role: zod_1.z.nativeEnum(UserEntity_1.UserRole).optional(),
    companyId: zod_1.z.string().uuid().optional(),
    search: zod_1.z.string().min(2).max(100).optional(),
});
// ─── Endpoints ────────────────────────────────────────────────────────────────
/**
 * POST /api/v1/admin/users/admin
 * Crear un usuario con rol ADMIN vinculado a una empresa.
 * Solo SUPER_ADMIN puede ejecutar este endpoint.
 */
router.post('/users/admin', (0, schemas_1.validateBody)(CreateStaffSchema), async (req, res, next) => {
    try {
        const user = await adminService.createAdmin(req.body);
        return res.status(201).json({
            message: 'Usuario ADMIN creado exitosamente',
            user,
        });
    }
    catch (error) {
        if (error.message?.includes('Ya existe'))
            return res.status(409).json({ error: error.message });
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * POST /api/v1/admin/users/driver
 * Crear un usuario con rol DRIVER vinculado a una empresa.
 * SUPER_ADMIN o ADMIN de la empresa pueden ejecutar este endpoint.
 */
router.post('/users/driver', (0, schemas_1.validateBody)(CreateStaffSchema), async (req, res, next) => {
    try {
        // Si es ADMIN (no SUPER_ADMIN), solo puede crear drivers de su propia empresa
        if (req.user?.role === UserEntity_1.UserRole.ADMIN && req.user.companyId !== req.body.companyId) {
            return res.status(403).json({ error: 'Solo puedes crear conductores para tu propia empresa' });
        }
        const user = await adminService.createDriver(req.body);
        return res.status(201).json({
            message: 'Usuario DRIVER creado exitosamente',
            user,
        });
    }
    catch (error) {
        if (error.message?.includes('Ya existe'))
            return res.status(409).json({ error: error.message });
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * PATCH /api/v1/admin/users/:id/role
 * Cambiar el rol de un usuario existente.
 * Solo SUPER_ADMIN puede cambiar roles.
 */
router.patch('/users/:id/role', (0, schemas_1.validateBody)(UpdateRoleSchema), async (req, res, next) => {
    try {
        const userId = req.params.id;
        const user = await adminService.updateUserRole({
            userId,
            role: req.body.role,
            companyId: req.body.companyId,
        });
        return res.status(200).json({
            message: `Rol actualizado a ${req.body.role}`,
            user,
        });
    }
    catch (error) {
        if (error.message?.includes('no encontrado'))
            return res.status(404).json({ error: error.message });
        if (error.message?.includes('SUPER_ADMIN'))
            return res.status(403).json({ error: error.message });
        next(error);
    }
});
/**
 * PATCH /api/v1/admin/users/:id/status
 * Activar o desactivar una cuenta de usuario.
 * Solo SUPER_ADMIN puede ejecutar este endpoint.
 */
router.patch('/users/:id/status', async (req, res, next) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'Campo requerido: isActive (boolean)' });
        }
        const userId = req.params.id;
        const result = await adminService.toggleUserStatus(userId, isActive);
        return res.status(200).json(result);
    }
    catch (error) {
        if (error.message?.includes('no encontrado'))
            return res.status(404).json({ error: error.message });
        if (error.message?.includes('SUPER_ADMIN'))
            return res.status(403).json({ error: error.message });
        next(error);
    }
});
/**
 * GET /api/v1/admin/users
 * Listar todos los usuarios con paginación y filtros.
 * SUPER_ADMIN ve todos. ADMIN solo ve usuarios de su empresa.
 * Query params: ?page=1&limit=20&role=PASSENGER&companyId=uuid&search=nombre
 */
router.get('/users', (0, schemas_1.validateQuery)(ListUsersQuerySchema), async (req, res, next) => {
    try {
        const query = req.validatedQuery;
        // ADMIN solo puede ver usuarios de su empresa
        if (req.user?.role === UserEntity_1.UserRole.ADMIN) {
            query.companyId = req.user.companyId;
        }
        const result = await adminService.listUsers(query);
        return res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /api/v1/admin/stats
 * Estadísticas del sistema: total usuarios, por rol, empresas activas.
 * Solo SUPER_ADMIN.
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await adminService.getSystemStats();
        return res.status(200).json(stats);
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=AdminController.js.map