import { useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { stripePromise } from '../lib/stripe';

function PaymentForm({ onSucceeded }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    // `redirect: 'if_required'` resolves inline for the common case (a card
    // that doesn't need 3D Secure or similar) and only leaves the page for a
    // payment method that genuinely requires it.
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed. Please try another payment method.');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      onSucceeded(paymentIntent);
    } else {
      setError(`Payment status: ${paymentIntent?.status || 'unknown'}. Please try again.`);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <PaymentElement />
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={!stripe || submitting}>
        {submitting ? 'Processing…' : 'Pay now'}
      </button>
    </form>
  );
}

export default function StripeCheckoutForm({ clientSecret, onSucceeded }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
      <PaymentForm onSucceeded={onSucceeded} />
    </Elements>
  );
}
