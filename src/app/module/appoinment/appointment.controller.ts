import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status"
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async(req: Request, res: Response)=>{

  const result = await AppointmentService.bookAppointment()

  
    
    sendResponse(res,{
        statusCode : httpStatus.OK,
        success : true,
        message : "Bkash Payment Create Successfully",
        data : result
    })
})
const bookAppointmentCallback = catchAsync(async(req: Request, res: Response)=>{

    
  const {executedPaymentResult, redirectUrl} = await AppointmentService.bookAppointmentPaymentCallback(req.query)
  
  console.log(executedPaymentResult)

  res.redirect(redirectUrl)
    
    
})


export const AppointmentController = {
    bookAppointment,
    bookAppointmentCallback
}
