/**
 * Schemas de validación con Zod v4
 * Nota: Zod v4 usa { error: 'mensaje' } en lugar de { required_error: 'mensaje' }
 */
import { z } from 'zod';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { TripStatus } from '../../modules/trips/domain/TripEntity';
import { VehicleType, ServiceMode } from '../../infrastructure/database/entities/VehicleEntity';
import { ParcelStatus } from '../../modules/parcels/domain/ParcelEntity';

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
    name: z
        .string()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(150, 'El nombre no puede superar 150 caracteres')
        .trim(),
    email: z
        .string()
        .email('Formato de correo inválido')
        .max(200, 'El correo no puede superar 200 caracteres')
        .toLowerCase(),
    password: z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .max(100, 'La contraseña no puede superar 100 caracteres'),
    role: z.nativeEnum(UserRole).optional(),
    companyId: z.string().uuid('companyId debe ser un UUID válido').optional(),
    docType: z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).optional(),
    docNum: z
        .string()
        .min(6, 'El número de documento debe tener al menos 6 caracteres')
        .max(20, 'El número de documento no puede superar 20 caracteres')
        .optional(),
    phone: z
        .string()
        .regex(/^[0-9+\-\s()]{7,20}$/, 'Formato de teléfono inválido')
        .optional(),
});

export const LoginSchema = z.object({
    email: z
        .string()
        .email('Formato de correo inválido')
        .toLowerCase(),
    password: z
        .string()
        .min(1, 'La contraseña es requerida'),
});

// ─── Booking Schemas ──────────────────────────────────────────────────────────

export const CreateBookingSchema = z.object({
    tripId: z
        .string()
        .uuid('tripId debe ser un UUID válido'),
    passengerName: z
        .string()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(150, 'El nombre no puede superar 150 caracteres')
        .trim(),
    passengerDocType: z.enum(['DNI', 'CE', 'PASAPORTE'], {
        error: 'Tipo de documento inválido. Use: DNI, CE o PASAPORTE',
    }),
    passengerDocNum: z
        .string()
        .min(6, 'El número de documento debe tener al menos 6 caracteres')
        .max(20, 'El número de documento no puede superar 20 caracteres')
        .regex(/^[A-Z0-9]+$/i, 'El número de documento solo puede contener letras y números'),
    startWaypointId: z
        .string()
        .uuid('startWaypointId debe ser un UUID válido'),
    endWaypointId: z
        .string()
        .uuid('endWaypointId debe ser un UUID válido'),
    seatId: z
        .string()
        .min(1, 'El asiento es requerido')
        .max(10, 'El ID de asiento no puede superar 10 caracteres')
        .regex(/^[A-Z0-9]+$/i, 'Formato de asiento inválido'),
}).refine(
    (data) => data.startWaypointId !== data.endWaypointId,
    { message: 'El origen y el destino no pueden ser el mismo punto', path: ['endWaypointId'] }
);

export const CreateDigitalBookingSchema = CreateBookingSchema.and(z.object({
    paymentDetails: z.object({
        method: z.string().min(1, 'El método de pago es requerido'),
        token: z.string().optional(),
        phoneNumber: z.string().optional(),
    }, { error: 'paymentDetails es requerido' }),
}));

// ─── Trip Management Schemas ──────────────────────────────────────────────────

export const CreateTripSchema = z.object({
    routeId: z
        .string()
        .uuid('routeId debe ser un UUID válido'),
    vehicleId: z
        .string()
        .uuid('vehicleId debe ser un UUID válido'),
    departureTime: z
        .string()
        .refine(
            (val) => !isNaN(Date.parse(val)),
            { message: 'Formato de fecha inválido. Use ISO 8601 (ej: 2026-07-15T08:00:00Z)' }
        )
        .transform((val) => new Date(val))
        .refine(
            (date) => date > new Date(),
            { message: 'La fecha de salida debe ser en el futuro' }
        ),
});

export const UpdateTripSchema = z.object({
    departureTime: z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), { message: 'Formato de fecha inválido. Use ISO 8601 (ej: 2026-07-15T08:00:00Z)' })
        .optional(),
    vehicleId: z.string().uuid('vehicleId debe ser un UUID válido').optional(),
    // undefined = no tocar; '' o null = quitar conductor; uuid = asignar
    driverId: z.union([z.string().uuid('driverId debe ser un UUID válido'), z.literal(''), z.null()]).optional(),
}).refine(
    (data) => data.departureTime !== undefined || data.vehicleId !== undefined || data.driverId !== undefined,
    { message: 'Debe proveer al menos uno de: departureTime, vehicleId, driverId' }
);

export const UpdateTripStatusSchema = z.object({
    status: z.nativeEnum(TripStatus, {
        error: `Estado inválido. Use: ${Object.values(TripStatus).join(', ')}`,
    }),
});

// ─── Company Schemas ──────────────────────────────────────────────────────────

export const CreateCompanySchema = z.object({
    ruc: z
        .string()
        .length(11, 'El RUC debe tener exactamente 11 dígitos')
        .regex(/^[0-9]+$/, 'El RUC solo puede contener números'),
    tradeName: z
        .string()
        .min(2, 'El nombre comercial debe tener al menos 2 caracteres')
        .max(150, 'El nombre comercial no puede superar 150 caracteres')
        .trim(),
    legalName: z
        .string()
        .min(2, 'La razón social debe tener al menos 2 caracteres')
        .max(150, 'La razón social no puede superar 150 caracteres')
        .trim(),
    commissionRate: z
        .number()
        .min(0, 'La comisión no puede ser negativa')
        .max(100, 'La comisión no puede superar el 100%')
        .optional()
        .default(0),
});

// ─── Vehicle Schemas ──────────────────────────────────────────────────────────

export const CreateVehicleSchema = z.object({
    companyId: z.string().uuid('companyId debe ser un UUID válido'),
    plateNumber: z
        .string()
        .min(5, 'La placa debe tener al menos 5 caracteres')
        .max(10, 'La placa no puede superar 10 caracteres')
        .regex(/^[A-Z0-9\-]+$/i, 'Formato de placa inválido'),
    vehicleType: z.nativeEnum(VehicleType, {
        error: `Tipo de vehículo inválido. Use: ${Object.values(VehicleType).join(', ')}`,
    }),
    serviceMode: z.nativeEnum(ServiceMode, {
        error: `Modo de servicio inválido. Use: ${Object.values(ServiceMode).join(', ')}`,
    }),
    seatTemplate: z.any().optional(),
    capacity: z
        .number()
        .int('La capacidad debe ser un número entero')
        .min(1, 'La capacidad mínima es 1')
        .max(100, 'La capacidad máxima es 100'),
    imageUrl: z.string().url('imageUrl debe ser una URL válida').optional().nullable(),
});

export const UpdateVehicleSchema = z.object({
    plateNumber: z
        .string()
        .min(5, 'La placa debe tener al menos 5 caracteres')
        .max(10, 'La placa no puede superar 10 caracteres')
        .regex(/^[A-Z0-9\-]+$/i, 'Formato de placa inválido')
        .optional(),
    vehicleType: z.nativeEnum(VehicleType).optional(),
    serviceMode: z.nativeEnum(ServiceMode).optional(),
    seatTemplate: z.any().optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
    imageUrl: z.string().url('imageUrl debe ser una URL válida').optional().nullable(),
});

// ─── Route / Station Schemas ──────────────────────────────────────────────────

export const CreateStationSchema = z.object({
    companyId: z.string().uuid('companyId debe ser un UUID válido').optional(),
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100).trim(),
    address: z.string().max(200).optional(),
    city: z.string().min(2, 'La ciudad debe tener al menos 2 caracteres').max(50).trim(),
    latitude: z.number().min(-90).max(90, 'Latitud inválida'),
    longitude: z.number().min(-180).max(180, 'Longitud inválida'),
});

export const UpdateStationSchema = z.object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100).trim(),
    city: z.string().min(2, 'La ciudad debe tener al menos 2 caracteres').max(50).trim(),
    address: z.string().max(200).optional(),
    latitude: z.number().min(-90).max(90, 'Latitud inválida').optional(),
    longitude: z.number().min(-180).max(180, 'Longitud inválida').optional(),
});

const WaypointInputSchema = z.object({
    id: z.string().uuid().optional(),
    stationId: z.string().uuid('stationId debe ser un UUID válido'),
    stopOrder: z.number().int().min(1, 'stopOrder debe ser mayor a 0'),
    estimatedDurationMins: z.number().int().min(0, 'estimatedDurationMins no puede ser negativo'),
    basePrice: z.number().min(0, 'basePrice no puede ser negativo'),
    basePriceFloor1: z.number().min(0).optional().nullable(),
});

export const CreateRouteSchema = z.object({
    companyId: z.string().uuid('companyId debe ser un UUID válido'),
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100).trim(),
    serviceMode: z.nativeEnum(ServiceMode, {
        error: `Modo de servicio inválido. Use: ${Object.values(ServiceMode).join(', ')}`,
    }),
    polyline: z.string().optional().nullable(),
    waypoints: z.array(WaypointInputSchema).min(2, 'Una ruta debe tener al menos 2 paradas (Origen y Destino)'),
});

export const UpdateRouteSchema = z.object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100).trim().optional(),
    serviceMode: z.nativeEnum(ServiceMode).optional(),
    polyline: z.string().optional().nullable(),
    waypoints: z.array(WaypointInputSchema).min(2, 'Una ruta debe tener al menos 2 paradas (Origen y Destino)').optional(),
});

// ─── Parcel Schemas ───────────────────────────────────────────────────────────

export const CreateParcelSchema = z.object({
    tripId: z.string().uuid('tripId debe ser un UUID válido'),
    senderName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(150).trim(),
    senderDoc: z.string().min(6, 'El documento debe tener al menos 6 caracteres').max(20).trim(),
    receiverName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(150).trim(),
    receiverDoc: z.string().min(6, 'El documento debe tener al menos 6 caracteres').max(20).trim(),
    startWaypointId: z.string().uuid('startWaypointId debe ser un UUID válido'),
    endWaypointId: z.string().uuid('endWaypointId debe ser un UUID válido'),
    description: z.string().max(500).optional(),
    weightKg: z.coerce.number().min(0, 'weightKg no puede ser negativo').optional(),
    totalPrice: z.coerce.number().min(0, 'totalPrice no puede ser negativo'),
    paymentMethod: z.string().optional(),
}).refine(
    (data) => data.startWaypointId !== data.endWaypointId,
    { message: 'El origen y el destino no pueden ser el mismo punto', path: ['endWaypointId'] }
);

export const UpdateParcelStatusSchema = z.object({
    status: z.nativeEnum(ParcelStatus, {
        error: `Estado inválido. Use: ${Object.values(ParcelStatus).join(', ')}`,
    }),
});

// ─── Search Schemas ───────────────────────────────────────────────────────────

export const SearchTripsQuerySchema = z.object({
    origin: z.string().min(2, 'La ciudad de origen debe tener al menos 2 caracteres').optional(),
    destination: z.string().min(2, 'La ciudad de destino debe tener al menos 2 caracteres').optional(),
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Use YYYY-MM-DD')
        .optional(),
    page: z.coerce.number().int().min(1, 'La página debe ser mayor a 0').optional().default(1),
    limit: z.coerce.number().int().min(1).max(50, 'El límite máximo es 50').optional().default(15),
});

// ─── Middleware de validación ─────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Middleware factory para validar el body de la petición con un schema Zod.
 * Retorna 400 con los errores de validación si falla.
 */
export const validateBody = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
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

/**
 * Middleware factory para validar los query params de la petición.
 */
export const validateQuery = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
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
        (req as any).validatedQuery = result.data;
        next();
    };
};

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type CreateTripInput = z.infer<typeof CreateTripSchema>;
export type UpdateTripStatusInput = z.infer<typeof UpdateTripStatusSchema>;
export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;
export type CreateVehicleInput = z.infer<typeof CreateVehicleSchema>;
export type SearchTripsQueryInput = z.infer<typeof SearchTripsQuerySchema>;
