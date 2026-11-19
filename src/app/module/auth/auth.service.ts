/** biome-ignore-all lint/style/useConst: <explanation> */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { TokenPayload } from "google-auth-library";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import {
	AuthProvider,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
	IForgotPasswordPayload,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPasswordPayload,
} from "./auth.interface";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import path from "path";

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password, patient: patientData } = payload;
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new Error("User with this email already exists");
	}

	const hashedPassword = await bcrypt.hash(password, Number(config.bcrypt_salt_rounds));

	const createdUser = await prisma.user.create({
		data: {
			name,
			email,
			password: hashedPassword,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: false,
			patient: {
				create: { name, email, contactNumber: patientData.contactNumber },
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

	const { patient, ...user } = createdUser;
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		user,
		patient,
		accessToken,
		refreshToken,
	};
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new Error("User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("User is deleted");
	}

	if (user.password === null && user.googleId !== null) {
		throw new Error(
			"User Already has account Register with google. Try to Login with Google",
		);
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password as string,
	);

	if (!isPasswordMatched) {
		throw new Error("Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			patient: true,
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new Error("User not found");
	}

	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new Error(
			config.node_env === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new Error("User is inactive or not found");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | null | undefined = null;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});
		googleIdTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Google ID Token Verification Failed", error);
		throw new Error("Invalid Or Expired Google Id Token");
	}
	if (!googleIdTokenPayload) {
		throw new Error("Invalid Or Expired Google Id Token");
	}
	if (!googleIdTokenPayload.email) {
		throw new Error("Google Email Not Found");
	}
	if (!googleIdTokenPayload.name) {
		throw new Error("Google Email user Name Not Found");
	}
	const ifPatientExistWithGoogleAuth = await prisma.user.findUnique({
		where: {
			email: googleIdTokenPayload.email,
			role: Role.PATIENT,
			googleId: googleIdTokenPayload.sub,
		},
	});
	let user = ifPatientExistWithGoogleAuth;

	if (!ifPatientExistWithGoogleAuth) {
		const ifPatientExitsWithCredentials = await prisma.user.findUnique({
			where: {
				email: googleIdTokenPayload.email,
				role: Role.PATIENT,
				authProvider: AuthProvider.CREDENTIALS,
			},
		});

		if (ifPatientExitsWithCredentials) {
			if (!ifPatientExitsWithCredentials.emailVerified) {
				throw new Error("Email not verify");
			}
			if (ifPatientExitsWithCredentials.status === UserStatus.BLOCKED) {
				throw new Error("User is Blocked");
			}
			if (
				ifPatientExitsWithCredentials.isDeleted ||
				ifPatientExitsWithCredentials.status === UserStatus.DELETED
			) {
				throw new Error("User already deleted");
			}
			user = await prisma.user.update({
				where: {
					id: ifPatientExitsWithCredentials.id,
				},
				data: {
					googleId: googleIdTokenPayload.sub,
				},
			});
		} else {
			// Google Register
			user = await prisma.user.create({
				data: {
					name: googleIdTokenPayload.name,
					email: googleIdTokenPayload.email,
					role: Role.PATIENT,
					googleId: googleIdTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					emailVerified: true,
					patient: {
						create: {
							name: googleIdTokenPayload.name,
							email: googleIdTokenPayload.email,
						},
					},
				},
			});
		}
	}

	if (!user) {
		throw new Error("User new Error");
	}
	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is Blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("User already deleted");
	}
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
	const { email } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExist) {
		throw new Error("User does not Exist!");
	}
	if (isUserExist.status === "BLOCKED") {
		throw new Error("User is Blocked");
	}
  if(!isUserExist.emailVerified){
    throw new Error("User Email is not verified");
  }
	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new Error("User is Deleted");
	}
	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new Error("User has account with Google");
	}

	const otp = crypto.randomInt(100000, 1000000).toString();

  const key = `forgot-password-otp:${isUserExist.email}`
  await redisClient.set(key, otp,{
    expiration : {
      type : "EX",
      value : 5 * 60
    }
  })
   
  const template = path.join(process.cwd(), "src/app/templates/forgot-password.ejs")
  const html = await ejs.renderFile(template, {
    OTP : otp
  })
    
await transporter.sendMail({
  from: config.email_sender,
  to: isUserExist.email,
  subject: "Reset Your Password - Healthcare",
  html 
});

};
const resetPassword = async (payload: IResetPasswordPayload) => {
  const { email, otp , newPassword } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExist) {
		throw new Error("User does not Exist!");
	}
	if (isUserExist.status === "BLOCKED") {
		throw new Error("User is Blocked");
	}
  if(!isUserExist.emailVerified){
    throw new Error("User Email is not verified");
  }
	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new Error("User is Deleted");
	}
	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new Error("User has account with Google");
	}
  const key = `forgot-password-otp:${isUserExist.email}`

  const redisOtp = await redisClient.get(key);

  if(!redisOtp){
    throw new Error("Invalid OTP")
  }
  if(redisOtp !== otp){
    throw new Error("OTP Does not match")
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, Number(config.bcrypt_salt_rounds));

   await prisma.user.update({
    where : {
      email : isUserExist.email
    },
    data : {
      password : hashedNewPassword
    }
  })


  
await transporter.sendMail({
  from: config.email_sender,
  to: isUserExist.email,
  subject: "Your Password Has Been Changed Successfully",
  html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Password Changed Successfully</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f7fb; font-family:Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background-color:#f4f7fb; padding:40px 15px;">
        <tr>
          <td align="center">

            <table width="100%" cellpadding="0" cellspacing="0" border="0"
              style="max-width:550px; background-color:#ffffff; border-radius:12px; overflow:hidden;">

              <!-- Header -->
              <tr>
                <td align="center"
                  style="background-color:#0d9488; padding:30px 20px;">
                  <h1 style="margin:0; color:#ffffff; font-size:26px;">
                    Healthcare
                  </h1>
                  <p style="margin:8px 0 0; color:#e0f2f1; font-size:14px;">
                    Your Health, Our Priority
                  </p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding:35px 30px; color:#334155;">

                  <!-- Success Icon -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center">
                        <div style="width:65px; height:65px; line-height:65px; background-color:#dcfce7; border-radius:50%; color:#16a34a; font-size:35px; font-weight:bold;">
                          &#10003;
                        </div>
                      </td>
                    </tr>
                  </table>

                  <h2 style="margin:25px 0 15px; color:#0f172a; font-size:22px; text-align:center;">
                    Password Changed Successfully!
                  </h2>

                  <p style="font-size:15px; line-height:1.7; margin:0 0 15px;">
                    Hello,
                  </p>

                  <p style="font-size:15px; line-height:1.7; margin:0 0 20px;">
                    Your Healthcare account password has been successfully changed.
                    You can now log in using your new password.
                  </p>

                  <!-- Success Notice -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background-color:#f0fdf4; border-left:4px solid #16a34a; padding:18px; border-radius:6px;">

                        <p style="margin:0; color:#166534; font-size:14px; line-height:1.7;">
                          <strong>Security Confirmation</strong><br />
                          Your account password has been updated successfully.
                          Your new password is now active.
                        </p>

                      </td>
                    </tr>
                  </table>

                  <p style="font-size:14px; line-height:1.7; margin:25px 0 10px;">
                    <strong>Didn't make this change?</strong>
                  </p>

                  <p style="font-size:14px; line-height:1.7; margin:0;">
                    If you did not change your password, please contact our
                    support team immediately to protect your account.
                  </p>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center"
                  style="background-color:#f8fafc; padding:22px 20px; border-top:1px solid #e2e8f0;">

                  <p style="margin:0 0 8px; color:#64748b; font-size:13px;">
                    Thank you for choosing Healthcare.
                  </p>

                  <p style="margin:0; color:#94a3b8; font-size:12px;">
                    &copy; ${new Date().getFullYear()} Healthcare. All rights reserved.
                  </p>

                  <p style="margin:10px 0 0; color:#94a3b8; font-size:11px;">
                    This is an automated email. Please do not reply.
                  </p>

                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `,
});


    await redisClient.del([key])


};

export const AuthService = {
	registerPatient,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
};
