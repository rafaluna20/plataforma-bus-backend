"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const CompanyService_1 = require("../../application/services/CompanyService");
const router = (0, express_1.Router)();
const companyService = new CompanyService_1.CompanyService();
/**
 * POST /api/v1/companies
 * Registrar una nueva empresa operadora en el marketplace
 */
router.post('/', async (req, res, next) => {
    try {
        const { ruc, tradeName, legalName, commissionRate } = req.body;
        if (!ruc || !tradeName || !legalName) {
            return res.status(400).json({ error: 'Campos requeridos: ruc, tradeName, legalName' });
        }
        const company = await companyService.create({ ruc, tradeName, legalName, commissionRate });
        return res.status(201).json({
            message: 'Empresa registrada exitosamente',
            company,
        });
    }
    catch (error) {
        if (error.message?.includes('RUC'))
            return res.status(409).json({ error: error.message });
        next(error);
    }
});
/**
 * GET /api/v1/companies
 * Listar todas las empresas activas
 */
router.get('/', async (req, res, next) => {
    try {
        const companies = await companyService.findAll();
        return res.status(200).json({ count: companies.length, companies });
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /api/v1/companies/:id
 * Obtener detalle de una empresa
 */
router.get('/:id', async (req, res, next) => {
    try {
        const company = await companyService.findById(req.params.id);
        return res.status(200).json(company);
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
/**
 * PUT /api/v1/companies/:id
 * Actualizar datos de empresa
 */
router.put('/:id', async (req, res, next) => {
    try {
        const company = await companyService.update(req.params.id, req.body);
        return res.status(200).json({ message: 'Empresa actualizada', company });
    }
    catch (error) {
        if (error.message?.includes('no encontrada'))
            return res.status(404).json({ error: error.message });
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=CompanyController.js.map