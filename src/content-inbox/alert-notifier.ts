import { Injectable, Logger } from '@nestjs/common';
import { ALERT_WEBHOOK_TIMEOUT_MS } from '../common/constants/inbox.constants';

export const ALERT_NOTIFIER = Symbol('ALERT_NOTIFIER');

export interface AlertNotifier {
  notify(message: string): Promise<void>;
}

/**
 * CONTENT_ALERT_WEBHOOK_URL로 알림을 보냅니다. 디스코드(content)·슬랙(text) 웹훅이 모두 읽도록 두 필드를 함께 보냅니다.
 * 주소가 없으면 서버 로그로만 남깁니다. 알림 실패가 학습을 막지 않도록 오류는 기록만 합니다.
 */
@Injectable()
export class WebhookAlertNotifier implements AlertNotifier {
  private readonly logger = new Logger('ContentAlert');

  async notify(message: string): Promise<void> {
    const url = process.env.CONTENT_ALERT_WEBHOOK_URL;
    if (!url) {
      this.logger.warn(`(웹훅 주소 없음) ${message}`);
      return;
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, text: message }),
        signal: AbortSignal.timeout(ALERT_WEBHOOK_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`알림 웹훅 응답 ${response.status}: ${message}`);
      }
    } catch (error) {
      this.logger.warn(
        `알림 웹훅 실패(${error instanceof Error ? error.message : String(error)}): ${message}`,
      );
    }
  }
}
