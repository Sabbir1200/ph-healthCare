import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {
  // Implementation for booking an appointment

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new Error("Bkash id token not found ");
  }

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-key": config.bkash_app_key,
      },
      body: JSON.stringify({
        agreementID: "TokenizedMerchant01L3IKB6H1565072174986",
        mode: "0011",
        payerReference: "01723888888",
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        merchantAssociationInfo: "MI05MID54RF09123456One",
        amount: "1200",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: "Inv0124", // appointment id
      }),
    },
  );
  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json()

    console.log({bkashCreatePaymentResult});

    return bkashCreatePaymentResult
};

const bookAppointmentPaymentCallback = async (query : Record<string, unknown>  ) => {
  // Implementation for handling the payment callback

  const paymentID = query.paymentID as string;
  if(!paymentID) {
    throw new Error("Payment ID not found in the callback query");
  }
  const status = query.status as string;
  if(!status) {
    throw new Error("Payment status not found in the callback query");
  }

  const bkashIdToken = await getBkashIdToken();
  if(!bkashIdToken) {
    throw new Error("Bkash id token not found ");
  }

  const executedPaymentResponse = await fetch(`${config.bkash_base_url}/tokenized/checkout/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",   
    Accept: "application/json",
    Authorization: bkashIdToken,
    "X-App-key": config.bkash_app_key,
    }, 
    body: JSON.stringify({
      paymentID: paymentID
    })
  })


const executedPaymentResult = await executedPaymentResponse.json();

if(status === "success"){
    return {
        executedPaymentResult,
        redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=success`
    }
}
if(status === "failure"){
    return {
        executedPaymentResult,
        redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=failure`
    }
}
if(status === "cancel"){
    return {
        executedPaymentResult,
        redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=cancel`
    }
}
 
  return {
        executedPaymentResult,
        redirectUrl : `${config.frontend_url}/dashboard/my-appointments`
    }
}

export const AppointmentService = {
  bookAppointment,
  bookAppointmentPaymentCallback
};
