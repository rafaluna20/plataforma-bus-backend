// Punto de entrada público del módulo Payments — otros módulos y app.ts
// deben importar únicamente desde aquí, nunca desde application/infrastructure/presentation directo.
export { default as paymentRoutes } from './presentation/PaymentController';
export { PaymentService } from './application/PaymentService';
export type { PaymentGateway, PaymentDetails, PaymentResult } from './application/ports/PaymentGateway';
export { MockPaymentAdapter } from './infrastructure/MockPaymentAdapter';
