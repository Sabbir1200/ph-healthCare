/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import z from "zod";

export const validateRequest = (zodSchema : z.ZodObject) =>{
	return catchAsync((req : Request, res: Response, next: NextFunction)=>{
			 
				const payload = req.body ?? {}

			const result = zodSchema.safeParse(payload);
			if(!result.success){
				const errorMessage = payload.error.issues
               .map((issue : any) => issue.message)
               .join(", ");
				throw new Error(errorMessage)
			}
			req.body = result.data

		next();
			
	})
}