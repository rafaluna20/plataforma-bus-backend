import { PaymentGateway, PaymentDetails, PaymentResult } from '../application/ports/PaymentGateway';
import crypto from 'crypto';

export class MockPaymentAdapter implements PaymentGateway {
    /**
     * Simula el procesamiento de un pago con Niubiz / Culqi / Stripe.
     * Retorna éxito en el 90% de los casos. Falla si el token/celular termina en "000".
     */
    public async processPayment(details: PaymentDetails): Promise<PaymentResult> {
        return new Promise((resolve) => {
            // Simulamos latencia de red (1.5 segundos) como una pasarela real
            setTimeout(() => {
                const identifier = details.method === 'CARD' ? details.token : details.phoneNumber;

                // Regla de simulación de fallo
                if (identifier && identifier.endsWith('000')) {
                    resolve({
                        success: false,
                        errorMessage: 'Fondos insuficientes o método rechazado por el banco emisor.'
                    });
                    return;
                }

                // Éxito
                resolve({
                    success: true,
                    transactionId: `txn_mock_${crypto.randomBytes(8).toString('hex')}`
                });
            }, 1500);
        });
    }
}
