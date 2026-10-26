import { departmentRepository } from '../repositories/departmentRepository.js';
export const getDepartments = async (_req, res, next) => {
    try {
        const departments = await departmentRepository.getAll();
        res.status(200).json({
            success: true,
            data: departments,
        });
    }
    catch (err) {
        next(err);
    }
};
export const createDepartment = async (req, res, next) => {
    try {
        const { name, code, budget, headId, head_id } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Department name is required',
                },
            });
            return;
        }
        const created = await departmentRepository.create({
            name: name.trim(),
            code: code ? String(code).trim().toUpperCase() : undefined,
            budget: budget !== undefined ? Number(budget) : undefined,
            head_id: head_id || headId || null,
        });
        res.status(201).json({
            success: true,
            data: created,
        });
    }
    catch (err) {
        next(err);
    }
};
export const updateDepartment = async (req, res, next) => {
    try {
        const id = String(req.params.id || '');
        if (!id) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Department ID is required',
                },
            });
            return;
        }
        const { name, code, budget, headId, head_id } = req.body;
        const updated = await departmentRepository.update(id, {
            name: name !== undefined ? String(name).trim() : undefined,
            code: code !== undefined ? String(code).trim().toUpperCase() : undefined,
            budget: budget !== undefined ? Number(budget) : undefined,
            head_id: head_id !== undefined ? head_id : headId !== undefined ? headId : undefined,
        });
        res.status(200).json({
            success: true,
            data: updated,
        });
    }
    catch (err) {
        next(err);
    }
};
export const deleteDepartment = async (req, res, next) => {
    try {
        const id = String(req.params.id || '');
        if (!id) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Department ID is required',
                },
            });
            return;
        }
        const result = await departmentRepository.delete(id);
        if (!result.success) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'DEPARTMENT_IN_USE',
                    message: result.reason || 'Cannot delete department',
                },
            });
            return;
        }
        res.status(200).json({
            success: true,
            message: 'Department deleted successfully',
        });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=departmentController.js.map