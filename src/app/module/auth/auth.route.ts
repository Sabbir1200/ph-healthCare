import {  Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";

import { validateRequest } from "../../middleware/validate.Request";
import { UserValidation } from "./auth.validation";

const router = Router();



router.post("/register", 
	// (req : Request, res: Response, next: NextFunction)=>{
	// 		try {
	// 			const payload = req.body ?? {}

	// 		const result = PatientValidation.PatientRegistrationZodSchema.safeParse(payload);
	// 		if(!result.success){
	// 			const errorMessage = payload.error.issues
    //            .map((issue : any) => issue.message)
    //            .join(", ");
	// 			throw new Error(errorMessage)
	// 		}
	// 		req.body = result.data

	// 	next();
	// 		} catch (error) {
	// 			next(error)
	// 		}
	// }
	validateRequest(UserValidation.PatientRegistrationZodSchema)
	,
	
	
	AuthController.registerPatient);
router.post("/login",validateRequest(UserValidation.LoginZodSchema), AuthController.loginUser);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/google", AuthController.googleLogin)
export const AuthRoutes = router;
