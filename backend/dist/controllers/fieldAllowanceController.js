import { fieldAllowanceService } from '../services/fieldAllowanceService.js';
import { fieldAllowanceDailyReportSchema, fieldAllowanceDecisionSchema, fieldAllowanceDistributionSchema, fieldAllowanceRequestSchema, } from '../validators/fieldAllowanceValidators.js';
const notFound = (res, message) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message, details: [] } });
export class FieldAllowanceController {
    async create(req, res, next) {
        try {
            const payload = fieldAllowanceRequestSchema.parse(req.body);
            const data = await fieldAllowanceService.create(req.user, payload);
            res.status(201).json({ success: true, data, message: payload.submit ? 'Field Allowance request submitted' : 'Draft saved' });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const payload = fieldAllowanceRequestSchema.parse(req.body);
            const data = await fieldAllowanceService.update(req.user, String(req.params.id), payload);
            if (!data) {
                notFound(res, 'Editable Field Allowance request not found');
                return;
            }
            res.json({ success: true, data, message: payload.submit ? 'Field Allowance request submitted' : 'Draft saved' });
        }
        catch (error) {
            next(error);
        }
    }
    async list(req, res, next) {
        try {
            const data = await fieldAllowanceService.list(req.user, {
                status: req.query.status, department: req.query.department,
                search: req.query.search,
            });
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async detail(req, res, next) {
        try {
            const data = await fieldAllowanceService.detail(req.user, String(req.params.id));
            if (!data) {
                notFound(res, 'Field Allowance trip not found');
                return;
            }
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async decide(req, res, next) {
        try {
            const payload = fieldAllowanceDecisionSchema.parse(req.body);
            const data = await fieldAllowanceService.decide(req.user, String(req.params.id), payload);
            if (!data) {
                notFound(res, 'Pending Field Allowance request not found');
                return;
            }
            res.json({ success: true, data, message: `Request ${payload.decision.toLowerCase().replace('_', ' ')}` });
        }
        catch (error) {
            next(error);
        }
    }
    async distribute(req, res, next) {
        try {
            const payload = fieldAllowanceDistributionSchema.parse(req.body);
            const data = await fieldAllowanceService.distribute(req.user, String(req.params.id), payload);
            if (!data) {
                notFound(res, 'Approved Field Allowance request not found');
                return;
            }
            res.status(201).json({ success: true, data, message: 'Amount distribution recorded' });
        }
        catch (error) {
            next(error);
        }
    }
    async addDailyReport(req, res, next) {
        try {
            const payload = fieldAllowanceDailyReportSchema.parse(req.body);
            const data = await fieldAllowanceService.addDailyReport(req.user, String(req.params.id), payload);
            res.status(201).json({ success: true, data, message: 'Daily expense added' });
        }
        catch (error) {
            next(error);
        }
    }
    async complete(req, res, next) {
        try {
            const data = await fieldAllowanceService.complete(req.user, String(req.params.id));
            if (!data) {
                notFound(res, 'Active Field Allowance trip not found');
                return;
            }
            res.json({ success: true, data, message: 'Field visit completed' });
        }
        catch (error) {
            next(error);
        }
    }
    async history(req, res, next) {
        try {
            const data = await fieldAllowanceService.history(req.user, {
                search: req.query.search, startDate: req.query.startDate,
                endDate: req.query.endDate,
            });
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async summary(req, res, next) {
        try {
            res.json({ success: true, data: await fieldAllowanceService.summary(req.user) });
        }
        catch (error) {
            next(error);
        }
    }
}
export const fieldAllowanceController = new FieldAllowanceController();
//# sourceMappingURL=fieldAllowanceController.js.map