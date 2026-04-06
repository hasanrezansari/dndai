import Razorpay from "razorpay";

let rzpSingleton: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error("Razorpay keys are not configured");
  }
  if (!rzpSingleton) {
    rzpSingleton = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return rzpSingleton;
}

export async function createRazorpaySparkOrder(params: {
  userId: string;
  packId: string;
  amountPaise: number;
  receipt: string;
}): Promise<{ id: string; amount: number; currency: string }> {
  const rzp = getRazorpay();
  const order = await rzp.orders.create({
    amount: params.amountPaise,
    currency: "INR",
    receipt: params.receipt.slice(0, 40),
    notes: {
      ashveil_user_id: params.userId,
      ashveil_pack_id: params.packId,
    },
  });
  return {
    id: order.id,
    amount: order.amount as number,
    currency: order.currency as string,
  };
}
