import { Router } from "express";
import { AuthController } from "../auth/auth.controller";
import { AppointmentController } from "./appointment.controller";

const router = Router();

router.post("/book-appointment", AppointmentController.bookAppointment)


export const AppointmentRoute = router;