import { Injectable, Logger } from '@nestjs/common';

type EnqueueMessageInput = {
  organizationId: string;
  phoneNumber: string;
  userNumber: string;
  text: string;
  sessionId: string;
  sendTime: string;
  messageId: string;
  windowSeconds: number;
};

type EnqueueResult = {
  isWindowOwner: boolean;
  skipAggregation: boolean;
};

type AggregatedWindow = {
  aggregatedText: string;
  messageIds: string[];
};

@Injectable()
export class WhatsappMessageQueueService {
  private readonly logger = new Logger(WhatsappMessageQueueService.name);
  private readonly redisUrl = process.env.REDIS_URL;
  private readonly ownerLockSeconds = 180;

  async enqueueMessage(input: EnqueueMessageInput): Promise<EnqueueResult> {
    const {
      organizationId,
      phoneNumber,
      userNumber,
      text,
      sessionId,
      sendTime,
      messageId,
      windowSeconds,
    } = input;

    if (!this.redisUrl) {
      this.logger.warn('REDIS_URL is not configured; skipping WhatsApp queue aggregation');
      return { isWindowOwner: true, skipAggregation: true };
    }

    try {
      const conversationKey = this.getConversationKey(organizationId, phoneNumber, userNumber);
      const windowKey = `${conversationKey}:window`;
      const touchKey = `${conversationKey}:touch`;
      const payload = JSON.stringify({
        message: text,
        sessionId,
        sendTime,
        messageId,
      });

      await this.redisCommand('RPUSH', [conversationKey, payload]);
      await this.redisCommand('EXPIRE', [conversationKey, String(Math.max(windowSeconds * 3, 30))]);
      // Every new message renews the active inactivity window.
      await this.redisCommand('SET', [touchKey, '1', 'EX', String(windowSeconds)]);

      const lock = await this.redisCommand('SET', [windowKey, '1', 'EX', String(this.ownerLockSeconds), 'NX']);
      return { isWindowOwner: lock === 'OK', skipAggregation: false };
    } catch (error) {
      this.logger.error('WhatsApp queue enqueue failed. Falling back to immediate processing.', {
        error: (error as Error).message,
      });
      return { isWindowOwner: true, skipAggregation: true };
    }
  }

  async waitAndConsumeWindow(
    organizationId: string,
    phoneNumber: string,
    userNumber: string,
    sessionId: string
  ): Promise<AggregatedWindow> {
    if (!this.redisUrl) {
      return { aggregatedText: '', messageIds: [] };
    }

    try {
      const conversationKey = this.getConversationKey(organizationId, phoneNumber, userNumber);
      const windowKey = `${conversationKey}:window`;
      const touchKey = `${conversationKey}:touch`;
      const pollMs = 1000;

      while (true) {
        await this.redisCommand('EXPIRE', [windowKey, String(this.ownerLockSeconds)]);
        const values = await this.redisCommand('LRANGE', [conversationKey, '0', '-1']);
        const entries = this.parseEntries(values);

        if (entries.length === 0) {
          await this.redisCommand('DEL', [conversationKey]);
          await this.redisCommand('DEL', [windowKey]);
          await this.redisCommand('DEL', [touchKey]);
          return { aggregatedText: '', messageIds: [] };
        }

        const lastEntry = entries[entries.length - 1];
        if (lastEntry.sessionId !== sessionId) {
          this.logger.warn('Ignoring buffered messages due to sessionId mismatch', {
            expectedSessionId: sessionId,
            bufferedSessionId: lastEntry.sessionId,
            organizationId,
            phoneNumber,
            userNumber,
          });
          await this.redisCommand('DEL', [windowKey]);
          return { aggregatedText: '', messageIds: [] };
        }

        const touchTtl = await this.redisCommand('TTL', [touchKey]);
        const ttlSeconds = Number(touchTtl);

        if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
          await this.redisCommand('DEL', [conversationKey]);
          await this.redisCommand('DEL', [windowKey]);
          await this.redisCommand('DEL', [touchKey]);
          const messageIds = entries
            .map((entry) => entry.messageId)
            .filter((id): id is string => Boolean(id));
          const aggregatedText = entries
            .map((entry) => entry.message.trim())
            .filter(Boolean)
            .join('\n');
          return { aggregatedText, messageIds };
        }

        await this.delay(pollMs);
      }
    } catch (error) {
      this.logger.error('WhatsApp queue consume failed. Falling back to immediate processing.', {
        error: (error as Error).message,
      });
      return { aggregatedText: '', messageIds: [] };
    }
  }

  private getConversationKey(organizationId: string, phoneNumber: string, userNumber: string): string {
    return `wa:inbox:${organizationId}:${phoneNumber}:${userNumber}`;
  }

  private async redisCommand(command: string, args: string[]): Promise<any> {
    const { endpoint, token } = this.parseUpstashRestUrl();
    const encodedArgs = [command, ...args].map((arg) => encodeURIComponent(arg));
    const url = `${endpoint}/${encodedArgs.join('/')}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Upstash command failed (${command}): ${response.status} ${body}`);
    }

    const data = (await response.json()) as { result?: any; error?: string };
    if (data.error) {
      throw new Error(`Upstash command error (${command}): ${data.error}`);
    }

    return data.result;
  }

  private parseUpstashRestUrl(): { endpoint: string; token: string } {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }

    const parsed = new URL(this.redisUrl);
    const token = decodeURIComponent(parsed.password || parsed.username || '');
    if (!token) {
      throw new Error('REDIS_URL must include the Upstash REST token in the URL user info');
    }

    if (parsed.protocol === 'https:') {
      return {
        endpoint: `${parsed.protocol}//${parsed.host}`,
        token,
      };
    }

    if (parsed.protocol === 'redis:' || parsed.protocol === 'rediss:') {
      // Upstash often provides REDIS_URL as redis(s):// while REST endpoint is https://host.
      return {
        endpoint: `https://${parsed.hostname}`,
        token,
      };
    }

    throw new Error('REDIS_URL protocol is not supported. Use https://, redis://, or rediss://');
  }

  private parseEntries(values: unknown): Array<{ message: string; sessionId: string; sendTime: string; messageId: string }> {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((value) => this.safeParseEntry(String(value)))
      .filter((entry): entry is { message: string; sessionId: string; sendTime: string; messageId: string } =>
        entry !== null,
      );
  }

  private safeParseEntry(
    raw: string,
  ): { message: string; sessionId: string; sendTime: string; messageId: string } | null {
    try {
      const parsed = JSON.parse(raw) as {
        message?: unknown;
        sessionId?: unknown;
        sendTime?: unknown;
        messageId?: unknown;
      };

      return {
        message: String(parsed.message ?? ''),
        sessionId: String(parsed.sessionId ?? ''),
        sendTime: String(parsed.sendTime ?? ''),
        messageId: String(parsed.messageId ?? ''),
      };
    } catch {
      return null;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
