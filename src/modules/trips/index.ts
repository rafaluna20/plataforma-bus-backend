// Punto de entrada público del módulo Trips — otros módulos y app.ts
// deben importar únicamente desde aquí, nunca desde domain/application/presentation directo.
export { default as tripRoutes } from './presentation/TripController';
export { default as tripMgmtRoutes } from './presentation/TripManagementController';
export { TripManagementService } from './application/TripManagementService';
export type { CreateTripDTO, UpdateTripStatusDTO, PaginationOptions } from './application/TripManagementService';
export { SearchTripsService } from './application/SearchTripsService';
export type { SearchTripsDTO, SearchTripsResult } from './application/SearchTripsService';
export { TripEntity, TripStatus } from './domain/TripEntity';
