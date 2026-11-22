// Sends push notifications through Expo's push service, which forwards them to APNs (iOS) and
// FCM (Android) with the credentials stored on EAS. Secret (optional): EXPO_ACCESS_TOKEN, needed
// only if "enhanced push security" is turned on for the Expo project.
// https://docs.expo.dev/push-notifications/sending-notifications/

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo takes at most 100 messages per request. */
const BATCH = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** `url` is the in-app path the app opens when the notification is tapped. */
  data: { url: string };
  sound?: 'default';
  /** Android channel; the app creates "default". */
  channelId?: string;
}

export interface PushResult {
  /** Tokens Expo accepted. */
  ok: string[];
  /** Tokens for phones that uninstalled the app or turned notifications off for good. Delete them. */
  unregistered: string[];
  /** Tokens that failed for another reason (try again on a later run). */
  failed: string[];
}

interface ExpoTicket {
  status?: string;
  details?: { error?: string };
}

export async function sendPush(
  messages: PushMessage[],
  options: { accessToken?: string; fetchImpl?: typeof fetch } = {},
): Promise<PushResult> {
  const result: PushResult = { ok: [], unregistered: [], failed: [] };
  const accessToken = options.accessToken ?? Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    let tickets: ExpoTicket[] = [];
    try {
      const response = await (options.fetchImpl ?? fetch)(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && Array.isArray(body?.data)) tickets = body.data as ExpoTicket[];
      else console.error('[expo-push] request failed', response.status, body?.errors ?? null);
    } catch (err) {
      console.error('[expo-push] request failed', err);
    }
    batch.forEach((message, index) => {
      const ticket = tickets[index];
      if (ticket?.status === 'ok') result.ok.push(message.to);
      else if (ticket?.details?.error === 'DeviceNotRegistered') result.unregistered.push(message.to);
      else result.failed.push(message.to);
    });
  }
  return result;
}
