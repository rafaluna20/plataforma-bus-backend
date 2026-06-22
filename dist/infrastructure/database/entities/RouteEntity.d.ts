import { CompanyEntity } from './CompanyEntity';
import { ServiceMode } from './VehicleEntity';
import { RouteWaypointEntity } from './RouteWaypointEntity';
export declare class RouteEntity {
    id: string;
    company: CompanyEntity;
    name: string;
    serviceMode: ServiceMode;
    polyline: string;
    createdAt: Date;
    waypoints: RouteWaypointEntity[];
}
//# sourceMappingURL=RouteEntity.d.ts.map