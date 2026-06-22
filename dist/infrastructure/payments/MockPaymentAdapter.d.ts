import { PaymentGateway, PaymentDetails, PaymentResult } from '../../application/ports/PaymentGateway';
export declare class MockPaymentAdapter implements PaymentGateway {
    /**
     * Simula el procesamiento de un pago con Niubiz / Culqi / Stripe.
     * Retorna éxito en el 90% de los casos. Falla si el token/celular termina en "000".
     */
    processPayment(details: PaymentDetails): Promise<PaymentResult>;
}
//# sourceMappingURL=MockPaymentAdapter.d.ts.map