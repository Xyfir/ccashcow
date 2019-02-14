import { finishCoinbasePayment } from 'lib/payment/coinbase/finish';
import { startCoinbasePayment } from 'lib/payment/coinbase/start';
import { startSquarePayment } from 'lib/payment/square/start';
import { getPayment } from 'lib/payment/get';
import { verifyJWT } from 'lib/jwt/verify';
import * as storage from 'node-persist';
import { RichCow } from 'types/rich-cow';
import { signJWT } from 'lib/jwt/sign';
import axios from 'axios';
import {
  COINBASE_WEBHOOK_SECRET,
  SQUARE_LOCATION_KEY,
  SQUARE_ACCESS_TOKEN,
  JWT_KEY,
  TESTS
} from 'constants/config';
import 'jest-extended';
import { finishSquarePayment } from 'lib/payment/square/finish';

beforeAll(async () => {
  await storage.init(TESTS.STORAGE);
  for (let i = 1; i < 4; i++) await storage.removeItem(`payment-${i}`);
});

test('sign and verify jwt', async () => {
  const payment: RichCow.Payment = { id: 1, amount: 999, methods: ['square'] };
  const encoded = await signJWT(payment, JWT_KEY);
  const decoded = await verifyJWT(encoded, JWT_KEY);
  expect(decoded.id).toBe(1);
  expect(decoded.amount).toBe(999);
  expect(decoded.methods).toMatchObject(['square']);
});

test('get payment', async () => {
  const jwt = await signJWT(
    { id: 1, amount: 999, methods: ['square'] },
    JWT_KEY
  );

  let payment = await getPayment(jwt);
  expect(payment.id).toBe(1);

  const _payment: RichCow.Payment = await storage.getItem('payment-1');
  expect(_payment).not.toBeUndefined();
  expect(_payment.id).toBe(1);

  payment = await getPayment(jwt);
  expect(payment.id).toBe(1);
});

test.only('square payment', async () => {
  await getPayment(
    await signJWT({ id: 2, amount: 999, methods: ['square'] }, JWT_KEY)
  );
  const { url } = await startSquarePayment(2);
  expect(url).toStartWith('https://connect.squareup.com/v2/checkout?c=');
  let payment: RichCow.Payment = await storage.getItem('payment-2');
  expect(payment.method).toBe('square');

  const res = await axios.post(
    `https://connect.squareup.com/v2/locations/${SQUARE_LOCATION_KEY}/transactions`,
    {
      card_nonce: 'fake-card-nonce-ok',
      amount_money: {
        amount: 999,
        currency: 'USD'
      },
      reference_id: '2',
      delay_capture: false,
      idempotency_key: Date.now().toString(),
      billing_address: {
        address_line_1: '',
        postal_code: '94103',
        country: 'US'
      }
    },
    { headers: { Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}` } }
  );

  const squareTransactionId: string = res.data.transaction.id;
  const { jwt } = await finishSquarePayment(
    await signJWT({ id: 2, amount: 1, methods: ['square'] }, JWT_KEY),
    squareTransactionId
  );
  await expect(verifyJWT(jwt, JWT_KEY)).not.toReject();
  payment = await storage.getItem('payment-2');
  expect(payment.paid).toBeNumber();
  expect(payment.squareTransactionId).toBe(squareTransactionId);
});

test('coinbase commerce payment', async () => {
  await getPayment(
    await signJWT({ id: 3, amount: 1, methods: ['coinbase-commerce'] }, JWT_KEY)
  );
  const { url } = await startCoinbasePayment(3);
  expect(url).toStartWith('https://commerce.coinbase.com/charges/');

  await expect(
    finishCoinbasePayment(
      await signJWT(
        { id: 3, amount: 1, methods: ['coinbase-commerce'] },
        COINBASE_WEBHOOK_SECRET
      ),
      'T3ST'
    )
  ).not.toReject();
  const payment: RichCow.Payment = await storage.getItem('payment-3');
  expect(payment.paid).toBeNumber();
  expect(payment.method).toBe('coinbase-commerce');
  expect(payment.coinbaseCommerceChargeCode).toBe('T3ST');
});
