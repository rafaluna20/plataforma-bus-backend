import { BookingEntity } from '../../infrastructure/database/entities/BookingEntity';
export interface CulqiChargeRequest {
    amount: number;
    currency_code: string;
    email: string;
    source_id: string;
    description?: string;
    metadata?: Record<string, string>;
}
export interface CulqiChargeResponse {
    id: string;
    object: string;
    amount: number;
    currency_code: string;
    email: string;
    outcome: {
        type: string;
        code: string;
        merchant_message: string;
        user_message: string;
    };
    source: {
        id: string;
        type: string;
        card_number: string;
        brand: string;
    };
}
export interface ProcessPaymentDTO {
    bookingId: string;
    userId: string;
    culqiToken: string;
    email: string;
}
export interface WalletPaymentDTO {
    bookingId: string;
    userId: string;
}
export declare class PaymentService {
    private get bookingRepo();
    private get userRepo();
    /**
     * Procesar pago con tarjeta de crédito/débito via Culqi.
     * El frontend debe tokenizar la tarjeta con Culqi.js primero.
     */
    processCardPayment(data: ProcessPaymentDTO): Promise<{
        success: boolean;
        chargeId: string;
        message: string;
        booking: BookingEntity;
    }>;
    /**
     * Pagar una reserva usando el saldo de la billetera digital del usuario.
     */
    processWalletPayment(data: WalletPaymentDTO): Promise<{
        success: boolean;
        newBalance: number;
        message: string;
        booking: BookingEntity;
    }>;
    /**
     * Recargar saldo en la billetera digital del usuario via Culqi.
     */
    rechargeWallet(data: {
        userId: string;
        amount: number;
        culqiToken: string;
        email: string;
    }): Promise<{
        newBalance: number;
        chargeId: string;
        message: string;
    }>;
    /**
     * Llamada real a la API de Culqi para crear un cargo.
     * En modo sandbox, usar la clave de prueba: sk_test_...
     */
    private createCulqiCharge;
    /**
     * Simulación de Culqi para entorno de desarrollo sin credenciales reales.
     * Simula un pago exitoso con datos ficticios.
     */
    private simulateCulqiCharge;
}
//# sourceMappingURL=PaymentService.d.ts.map