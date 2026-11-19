/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import type { NextFunction, Request, Response } from "express";
import type z from "zod";
import { catchAsync } from "../utils/catchAsync";

export const validateRequest = (zodSchema: z.ZodObject) => {
	return catchAsync((req: Request, res: Response, next: NextFunction) => {
		const payload = req.body ?? {};

		const result = zodSchema.safeParse(payload);
		if (!result.success) {
			const errorMessage = payload.error.issues
				.map((issue: any) => issue.message)
				.join(", ");
			throw new Error(errorMessage);
		}
		req.body = result.data;

		next();
	});
};
