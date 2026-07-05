// Punto de entrada público del módulo Bookings — otros módulos y app.ts
// deben importar únicamente desde aquí, nunca desde domain/application/presentation directo.
export { default as bookingRoutes } from './presentation/BookingController';
export { BookingService } from './application/BookingService';
export type { CreateBookingDTO } from './application/BookingService';
export { BookingEntity, PaymentStatus } from './domain/BookingEntity';
