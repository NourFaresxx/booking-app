import { loadStripe } from '@stripe/stripe-js';

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// loadStripe(undefined) throws, and a missing key is a real possibility in a
// freshly cloned dev setup — fail soft so the rest of the app still runs and
// CheckoutPage can show a clear message instead of a blank crashed page.
export const stripePromise = key ? loadStripe(key) : Promise.resolve(null);
export const isStripeConfigured = Boolean(key);
