import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
export type AfroResponse = {
  acknowledge: string;
  response: {
    phone: string;
    code: string;
    verificationId: string;
    sentAt: string;
  };
};
@Injectable()
export class SmsService {
  constructor() {}
  async sendVerificationCode(
    phone: string,
    otp: string,
  ): Promise<{ error?: string; afro: AfroResponse | null }> {
    const base_url = process.env.AFRO_SMS_BASE_URL + '/send';
    const token = process.env.AFRO_TOKEN as string;
    const identifierId = process.env.AFRO_SMS_IDENTIFIER as string;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const message = `Your verification code is ${otp}`;
    console.log(message);
    try {
      const res: { data: AfroResponse } = await axios.post(
        base_url,
        { identifierId, to: phone, message },
        { headers },
      );
      Logger.log('[**] SMS SENT', res.data);
      return { error: '', afro: res.data };
    } catch (error: AxiosError | any) {
      Logger.warn('Error In Sending SMS', error.message);
      return { error: error?.message?.toString(), afro: null };
    }
  }
}
