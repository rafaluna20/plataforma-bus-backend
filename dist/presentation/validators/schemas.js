"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateQuery = exports.validateBody = exports.SearchTripsQuerySchema = exports.CreateVehicleSchema = exports.CreateCompanySchema = exports.UpdateTripStatusSchema = exports.CreateTripSchema = exports.CreateBookingSchema = exports.LoginSchema = exports.RegisterSchema = void 0;
/**
 * Schemas de validación con Zod v4
 * Nota: Zod v4 usa { error: 'mensaje' } en lugar de { required_error: 'mensaje' }
 */
const zod_1 = require("zod");
const UserEntity_1 = require("../../infrastructure/database/entities/UserEntity");
const TripEntity_1 = require("../../infrastructure/database/entities/TripEntity");
// ─── Auth Schemas ─────────────────────────────────────────────────────────────
exports.RegisterSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(150, 'El nombre no puede superar 150 caracteres')
        .trim(),
    email: zod_1.z
        .string()
        .email('Formato de correo inválido')
        .max(200, 'El correo no puede superar 200 caracteres')
        .toLowerCase(),
    password: zod_1.z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .max(100, 'La contraseña no puede superar 100 caracteres'),
    role: zod_1.z.nativeEnum(UserEntity_1.UserRole).optional(),
    companyId: zod_1.z.string().uuid('companyId debe ser un UUID válido').optional(),
    docType: zod_1.z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).optional(),
    docNum: zod_1.z
        .string()
        .min(6, 'El número de documento debe tener al menos 6 caracteres')
        .max(20, 'El número de documento no puede superar 20 caracteres')
        .optional(),
    phone: zod_1.z
        .string()
        .regex(/^[0-9+\-\s()]{7,20}$/, 'Formato de teléfono inválido')
        .optional(),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email('Formato de correo inválido')
        .toLowerCase(),
    password: zod_1.z
        .string()
        .min(1, 'La contraseña es requerida'),
});
// ─── Booking Schemas ──────────────────────────────────────────────────────────
exports.CreateBookingSchema = zod_1.z.object({
    tripId: zod_1.z
        .string()
        .uuid('tripId debe ser un UUID válido'),
    passengerName: zod_1.z
        .string()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(150, 'El nombre no puede superar 150 caracteres')
        .trim(),
    passengerDocType: zod_1.z.enum(['DNI', 'CE', 'PASAPORTE'], {
        error: 'Tipo de documento inválido. Use: DNI, CE o PASAPORTE',
    }),
    passengerDocNum: zod_1.z
        .string()
        .min(6, 'El número de documento debe tener al menos 6 caracteres')
        .max(20, 'El número de documento no puede superar 20 caracteres')
        .regex(/^[A-Z0-9]+$/i, 'El número de documento solo puede contener letras y números'),
    startWaypointId: zod_1.z
        .string()
        .uuid('startWaypointId debe ser un UUID válido'),
    endWaypointId: zod_1.z
        .string()
        .uuid('endWaypointId debe ser un UUID válido'),
    seatId: zod_1.z
        .string()
        .min(1, 'El asiento es requerido')
        .max(10, 'El ID de asiento no puede superar 10 caracteres')
        .regex(/^[A-Z0-9]+$/i, 'Formato de asiento inválido'),
}).refine((data) => data.startWaypointId !== data.endWaypointId, { message: 'El origen y el destino no pueden ser el mismo punto', path: ['endWaypointId'] });
// ─── Trip Management Schemas ──────────────────────────────────────────────────
exports.CreateTripSchema = zod_1.z.object({
    routeId: zod_1.z
        .string()
        .uuid('routeId debe ser un UUID válido'),
    vehicleId: zod_1.z
        .string()
        .uuid('vehicleId debe ser un UUID válido'),
    departureTime: zod_1.z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), { message: 'Formato de fecha inválido. Use ISO 8601 (ej: 2026-07-15T08:00:00Z)' })
        .transform((val) => new Date(val))
        .refine((date) => date > new Date(), { message: 'La fecha de salida debe ser en el futuro' }),
});
exports.UpdateTripStatusSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(TripEntity_1.TripStatus, {
        error: `Estado inválido. Use: ${Object.values(TripEntity_1.TripStatus).join(', ')}`,
    }),
});
// ─── Company Schemas ──────────────────────────────────────────────────────────
exports.CreateCompanySchema = zod_1.z.object({
    ruc: zod_1.z
        .string()
        .length(11, 'El RUC debe tener exactamente 11 dígitos')
        .regex(/^[0-9]+$/, 'El RUC solo puede contener números'),
    tradeName: zod_1.z
        .string()
        .min(2, 'El nombre comercial debe tener al menos 2 caracteres')
        .max(150, 'El nombre comercial no puede superar 150 caracteres')
        .trim(),
    legalName: zod_1.z
        .string()
        .min(2, 'La razón social debe tener al menos 2 caracteres')
        .max(150, 'La razón social no puede superar 150 caracteres')
        .trim(),
    commissionRate: zod_1.z
        .number()
        .min(0, 'La comisión no puede ser negativa')
        .max(100, 'La comisión no puede superar el 100%')
        .optional()
        .default(0),
});
// ─── Vehicle Schemas ──────────────────────────────────────────────────────────
exports.CreateVehicleSchema = zod_1.z.object({
    plateNumber: zod_1.z
        .string()
        .min(5, 'La placa debe tener al menos 5 caracteres')
        .max(10, 'La placa no puede superar 10 caracteres')
        .regex(/^[A-Z0-9\-]+$/i, 'Formato de placa inválido')
        .toUpperCase(),
    brand: zod_1.z
        .string()
        .min(2, 'La marca debe tener al menos 2 caracteres')
        .max(50, 'La marca no puede superar 50 caracteres')
        .trim(),
    model: zod_1.z
        .string()
        .min(1, 'El modelo es requerido')
        .max(50, 'El modelo no puede superar 50 caracteres')
        .trim(),
    capacity: zod_1.z
        .number()
        .int('La capacidad debe ser un número entero')
        .min(1, 'La capacidad mínima es 1')
        .max(100, 'La capacidad máxima es 100'),
    companyId: zod_1.z
        .string()
        .uuid('companyId debe ser un UUID válido'),
});
// ─── Search Schemas ───────────────────────────────────────────────────────────
exports.SearchTripsQuerySchema = zod_1.z.object({
    origin: zod_1.z.string().min(2, 'La ciudad de origen debe tener al menos 2 caracteres').optional(),
    destination: zod_1.z.string().min(2, 'La ciudad de destino debe tener al menos 2 caracteres').optional(),
    date: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Use YYYY-MM-DD')
        .optional(),
    page: zod_1.z.coerce.number().int().min(1, 'La página debe ser mayor a 0').optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50, 'El límite máximo es 50').optional().default(15),
});
/**
 * Middleware factory para validar el body de la petición con un schema Zod.
 * Retorna 400 con los errores de validación si falla.
 */
const validateBody = (schema) => {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            res.status(400).json({
                error: 'Datos de entrada inválidos',
                details: errors,
            });
            return;
        }
        req.body = result.data; // Reemplazar con datos validados y transformados
        next();
    };
};
exports.validateBody = validateBody;
/**
 * Middleware factory para validar los query params de la petición.
 */
const validateQuery = (schema) => {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            res.status(400).json({
                error: 'Parámetros de búsqueda inválidos',
                details: errors,
            });
            return;
        }
        req.validatedQuery = result.data;
        next();
    };
};
exports.validateQuery = validateQuery;
//# sourceMappingURL=schemas.js.map