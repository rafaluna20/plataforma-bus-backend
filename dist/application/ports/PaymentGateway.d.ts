export interface PaymentDetails {
    method: 'CARD' | 'YAPE' | 'PLIN';
    amount: number;
    currency: string;
    token?: string;
    phoneNumber?: string;
}
export interface PaymentResult {
    success: boolean;
    transactionId?: string;
    errorMessage?: string;
}
export interface PaymentGateway {
    processPayment(details: PaymentDetails): Promise<PaymentResult>;
}
//# sourceMappingURL=PaymentGateway.d.ts.map