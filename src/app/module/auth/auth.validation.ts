import z from "zod";

const PatientRegistrationZodSchema = z.object({
	name: z.string(),
	email: z.email(),
	password: z.string(),
	patient: z
		.object({
			contactNumber: z.string().optional(),
		})
		.optional(),
});
const PatientEmailVerifyZodSchema = z.object({
	
	email: z.email(),
	otp: z.string().length(6)
	
	
});

const LoginZodSchema = z.object({
	email: z.email(),
	password: z.string(),
});

export const UserValidation = {
	PatientRegistrationZodSchema,
	LoginZodSchema,
	PatientEmailVerifyZodSchema
};
