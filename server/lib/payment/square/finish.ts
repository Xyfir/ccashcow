import { verifyJWT } from 'lib/jwt/verify';
import * as storage from 'node-persist';
import { RichCow } from 'types/rich-cow';
import { signJWT } from 'lib/jwt/sign';
import axios from 'axios';
import {
  SQUARE_ACCESS_TOKEN,
  SQUARE_LOCATION_KEY,
  JWT_KEY,
  STORAGE
} from 'constants/config';

export async function finishSquarePayment(
  jwt: string,
  squareTransactionId: string
): Promise<{ jwt: string }> {
  const { id: paymentId } = await verifyJWT(jwt, JWT_KEY);

  await storage.init(STORAGE);
  const payment: RichCow.Payment = await storage.getItem(
    `payment-${paymentId}`
  );
  if (payment.method != 'square') throw 'Not a Square payment';
  if (payment.paid) throw 'Payment has already been paid';

  // Verify transaction with Square
  const res = await axios.get(
    `https://connect.squareup.com/v2/locations/${SQUARE_LOCATION_KEY}/transactions/${squareTransactionId}`,
    { headers: { Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}` } }
  );
  if (res.data.transaction.reference_id != payment.id.toString())
    throw 'Invalid transaction';

  // Save completed payment
  payment.paid = Date.now();
  payment.squareTransactionId = squareTransactionId;
  await storage.setItem(`payment-${payment.id}`, payment);

  return { jwt: await signJWT(payment, JWT_KEY) };
}
