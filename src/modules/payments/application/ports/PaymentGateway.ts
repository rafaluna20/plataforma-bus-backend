export interface PaymentDetails {
    method: 'CARD' | 'YAPE' | 'PLIN';
    amount: number;
    currency: string;
    token?: string; // Token de tarjeta segura
    phoneNumber?: string; // Para Yape/Plin
}

export interface PaymentResult {
    success: boolean;
    transactionId?: string;
    errorMessage?: string;
}

export interface PaymentGateway {
    processPayment(details: PaymentDetails): Promise<PaymentResult>;
}
