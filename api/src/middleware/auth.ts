import type { Request, Response, NextFunction } from "express";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const expectedKey = process.env.API_KEY;

    if (!expectedKey) {
        next();
        return;
    }

    const providedKey = req.header("x-api-key") || req.query.apiKey;

    if (providedKey === expectedKey) {
        next();
        return;
    }

    res.status(401).json({ success: false, message: "Unauthorized" });
}
