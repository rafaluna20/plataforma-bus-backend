import { AppDataSource } from '../../infrastructure/database/data-source';
import { AuditLogEntity } from '../../infrastructure/database/entities/AuditLogEntity';

export class AuditLogService {
    private static get repo() {
        return AppDataSource.getRepository(AuditLogEntity);
    }

    public static async log({
        userId,
        userEmail,
        action,
        entityName,
        entityId,
        oldValue,
        newValue,
        ipAddress,
        userAgent,
    }: {
        userId?: string | null;
        userEmail?: string | null;
        action: string;
        entityName?: string | null;
        entityId?: string | null;
        oldValue?: any | null;
        newValue?: any | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<void> {
        try {
            const audit = this.repo.create({
                userId: userId || null,
                userEmail: userEmail || null,
                action,
                entityName: entityName || null,
                entityId: entityId || null,
                oldValue: oldValue || null,
                newValue: newValue || null,
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
            });
            await this.repo.save(audit);
        } catch (error) {
            console.error('Error saving audit log:', error);
        }
    }

    public static async getLogs(page = 1, limit = 50) {
        const skip = (page - 1) * limit;
        const [logs, total] = await this.repo.findAndCount({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
        });
        return {
            data: logs,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
}
