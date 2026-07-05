// Punto de entrada público del módulo Parcels — otros módulos y app.ts
// deben importar únicamente desde aquí, nunca desde domain/application/presentation directo.
export { default as parcelRoutes } from './presentation/ParcelController';
export { ParcelService } from './application/ParcelService';
export type { CreateParcelDTO, UpdateParcelStatusDTO } from './application/ParcelService';
export { ParcelEntity, ParcelStatus } from './domain/ParcelEntity';
