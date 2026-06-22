import { BookingEntity } from '../../infrastructure/database/entities/BookingEntity';
import { PaymentGateway, PaymentDetails } from '../ports/PaymentGateway';
export interface CreateBookingDTO {
    tripId: string;
    passengerName: string;
    passengerDocType: string;
    passengerDocNum: string;
    startWaypointId: string;
    endWaypointId: string;
    seatId: string;
    userId?: string;
}
export declare class BookingService {
    private validateAndCalculate;
    /**
     * Crea una reserva al contado validando estrictamente el overbooking por tramos.
     * Nivel de aislamiento SERIALIZABLE para prevenir condiciones de carrera.
     */
    createCashBooking(data: CreateBookingDTO): Promise<BookingEntity>;
    /**
     * Crea una reserva digital. Ejecuta el cobro de forma síncrona.
     * Si el pago falla, aborta la transacción y libera el asiento.
     */
    createDigitalBooking(data: CreateBookingDTO, paymentGateway: PaymentGateway, paymentDetails: PaymentDetails): Promise<BookingEntity>;
    /**
     * Obtener reservas de un usuario autenticado
     */
    getMyBookings(userId: string, page?: number, limit?: number): Promise<{
        data: BookingEntity[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    /**
     * Cancelar una reserva (solo si está PENDING_CASH o PENDING_DIGITAL)
     */
    cancelBooking(bookingId: string, userId?: string): Promise<BookingEntity>;
}
//# sourceMappingURL=BookingService.d.ts.map