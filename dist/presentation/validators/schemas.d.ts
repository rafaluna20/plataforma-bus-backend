/**
 * Schemas de validación con Zod v4
 * Nota: Zod v4 usa { error: 'mensaje' } en lugar de { required_error: 'mensaje' }
 */
import { z } from 'zod';
import { UserRole } from '../../infrastructure/database/entities/UserEntity';
import { TripStatus } from '../../infrastructure/database/entities/TripEntity';
export declare const RegisterSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<typeof UserRole>>;
    companyId: z.ZodOptional<z.ZodString>;
    docType: z.ZodOptional<z.ZodEnum<{
        DNI: "DNI";
        CE: "CE";
        PASAPORTE: "PASAPORTE";
        RUC: "RUC";
    }>>;
    docNum: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const LoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const CreateBookingSchema: z.ZodObject<{
    tripId: z.ZodString;
    passengerName: z.ZodString;
    passengerDocType: z.ZodEnum<{
        DNI: "DNI";
        CE: "CE";
        PASAPORTE: "PASAPORTE";
    }>;
    passengerDocNum: z.ZodString;
    startWaypointId: z.ZodString;
    endWaypointId: z.ZodString;
    seatId: z.ZodString;
}, z.core.$strip>;
export declare const CreateTripSchema: z.ZodObject<{
    routeId: z.ZodString;
    vehicleId: z.ZodString;
    departureTime: z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>;
}, z.core.$strip>;
export declare const UpdateTripStatusSchema: z.ZodObject<{
    status: z.ZodEnum<typeof TripStatus>;
}, z.core.$strip>;
export declare const CreateCompanySchema: z.ZodObject<{
    ruc: z.ZodString;
    tradeName: z.ZodString;
    legalName: z.ZodString;
    commissionRate: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, z.core.$strip>;
export declare const CreateVehicleSchema: z.ZodObject<{
    plateNumber: z.ZodString;
    brand: z.ZodString;
    model: z.ZodString;
    capacity: z.ZodNumber;
    companyId: z.ZodString;
}, z.core.$strip>;
export declare const SearchTripsQuerySchema: z.ZodObject<{
    origin: z.ZodOptional<z.ZodString>;
    destination: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
}, z.core.$strip>;
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
/**
 * Middleware factory para validar el body de la petición con un schema Zod.
 * Retorna 400 con los errores de validación si falla.
 */
export declare const validateBody: (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => void;
/**
 * Middleware factory para validar los query params de la petición.
 */
export declare const validateQuery: (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => void;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type CreateTripInput = z.infer<typeof CreateTripSchema>;
export type UpdateTripStatusInput = z.infer<typeof UpdateTripStatusSchema>;
export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;
export type CreateVehicleInput = z.infer<typeof CreateVehicleSchema>;
export type SearchTripsQueryInput = z.infer<typeof SearchTripsQuerySchema>;
//# sourceMappingURL=schemas.d.ts.map