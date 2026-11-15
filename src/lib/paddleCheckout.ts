// Paddle checkout for credit packs on the web (pinch-app.io/app). Paddle is the merchant of
// record; it charges the card and tells supabase/functions/paddle-webhook, which grants the
// credits to the user id passed here as customData.user_id.
//
// Paddle.js is loaded from Paddle's CDN the first time someone buys, so it costs nothing
// for visitors who never open checkout.

const SCRIPT_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js';

export type CheckoutResult = 'purchased' | 'cancelled';

interface PaddleEvent {
  name?: string;
}

interface PaddleGlobal {
  Environment: { set(environment: 'sandbox' | 'production'): void };
  Initialize(options: { token: string; eventCallback?: (event: PaddleEvent) => void }): void;
  Checkout: {
    open(options: {
      items: { priceId: string; quantity: number }[];
      customData?: Record<string, string>;
      customer?: { email: string };
      settings?: Record<string, unknown>;
    }): void;
  };
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

let ready: Promise<PaddleGlobal> | null = null;
let pending: ((result: CheckoutResult) => void) | null = null;
let completed = false;

function onPaddleEvent(event: PaddleEvent) {
  if (event.name === 'checkout.completed') completed = true;
  if (event.name === 'checkout.closed' && pending) {
    const settle = pending;
    pending = null;
    settle(completed ? 'purchased' : 'cancelled');
  }
}

function loadPaddle(token: string, environment: string | undefined): Promise<PaddleGlobal> {
  ready ??= new Promise<PaddleGlobal>((resolve, reject) => {
    const init = () => {
      const paddle = window.Paddle;
      if (!paddle) return reject(new Error('paddle_unavailable'));
      if (environment === 'sandbox') paddle.Environment.set('sandbox');
      paddle.Initialize({ token, eventCallback: onPaddleEvent });
      resolve(paddle);
    };
    if (window.Paddle) return init();
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = init;
    script.onerror = () => reject(new Error('paddle_unavailable'));
    document.head.appendChild(script);
  }).catch((error) => {
    ready = null; // let the next tap try again, e.g. after a network blip
    throw error;
  });
  return ready;
}

/**
 * Opens Paddle's overlay checkout. Resolves when the buyer closes it: 'purchased' when
 * payment went through (credits arrive with the webhook a moment later), else 'cancelled'.
 */
export async function openPaddleCheckout(options: {
  token: string;
  environment: string | undefined;
  priceId: string;
  userId: string;
  email?: string | null;
}): Promise<CheckoutResult> {
  const paddle = await loadPaddle(options.token, options.environment);
  pending?.('cancelled');
  completed = false;
  return await new Promise<CheckoutResult>((resolve) => {
    pending = resolve;
    paddle.Checkout.open({
      items: [{ priceId: options.priceId, quantity: 1 }],
      customData: { user_id: options.userId },
      ...(options.email ? { customer: { email: options.email } } : {}),
      settings: {
        displayMode: 'overlay',
        variant: 'one-page',
        allowLogout: false,
      },
    });
  });
}
