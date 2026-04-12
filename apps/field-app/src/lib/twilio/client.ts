import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!accountSid || !authToken || !verifyServiceSid) {
  console.warn('Twilio credentials not configured. SMS verification will not work.');
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send OTP verification code via SMS
 */
export async function sendVerificationCode(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  if (!client || !verifyServiceSid) {
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    // Normalize phone number (ensure it has country code)
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    const verification = await client.verify.v2
      .services(verifyServiceSid)
      .verifications.create({
        to: normalizedPhone,
        channel: 'sms',
      });

    return { success: verification.status === 'pending' };
  } catch (error) {
    console.error('Error sending verification code:', error);
    const message = error instanceof Error ? error.message : 'Failed to send verification code';
    return { success: false, error: message };
  }
}

/**
 * Verify OTP code
 */
export async function verifyCode(
  phoneNumber: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  if (!client || !verifyServiceSid) {
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    const verificationCheck = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({
        to: normalizedPhone,
        code,
      });

    if (verificationCheck.status === 'approved') {
      return { success: true };
    }

    return { success: false, error: 'Invalid or expired code' };
  } catch (error) {
    console.error('Error verifying code:', error);
    const message = error instanceof Error ? error.message : 'Failed to verify code';
    return { success: false, error: message };
  }
}

/**
 * Normalize phone number to E.164 format
 * Assumes US numbers if no country code provided
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If already has country code (11+ digits starting with 1 for US)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // If 10 digits, assume US and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If already in E.164 format with +
  if (phone.startsWith('+')) {
    return phone;
  }

  // Return as-is with + prefix
  return `+${digits}`;
}

export { client as twilioClient };
