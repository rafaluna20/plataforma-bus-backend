"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockPaymentAdapter = void 0;
const crypto_1 = __importDefault(require("crypto"));
class MockPaymentAdapter {
    /**
     * Simula el procesamiento de un pago con Niubiz / Culqi / Stripe.
     * Retorna éxito en el 90% de los casos. Falla si el token/celular termina en "000".
     */
    async processPayment(details) {
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
                    transactionId: `txn_mock_${crypto_1.default.randomBytes(8).toString('hex')}`
                });
            }, 1500);
        });
    }
}
exports.MockPaymentAdapter = MockPaymentAdapter;
//# sourceMappingURL=MockPaymentAdapter.js.map