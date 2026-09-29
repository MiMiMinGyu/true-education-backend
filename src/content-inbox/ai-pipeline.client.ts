import { Injectable } from '@nestjs/common';
import { PIPELINE_REQUEST_TIMEOUT_MS } from '../common/constants/inbox.constants';

export const AI_PIPELINE_CLIENT = Symbol('AI_PIPELINE_CLIENT');

export interface PipelineBookSummary {
  id: string;
  title: string;
}

/** AI 파트 생성 파이프라인 API(production_api.py). 검증을 통과한 책만 목록에 나옵니다. */
export interface AiPipelineClient {
  /** AI_PIPELINE_URL·AI_PIPELINE_TOKEN이 모두 있을 때만 true */
  readonly enabled: boolean;
  listBooks(): Promise<PipelineBookSummary[]>;
  /** 책 JSON 원본(동화 기준 형식, docs/samples/folkency-5747.json) */
  getBook(id: string): Promise<unknown>;
}

/**
 * AI 파트 PC의 파이프라인 API를 Tailscale 사설망으로 호출합니다.
 * 토큰은 환경변수에서만 읽고 로그·오류 메시지에 넣지 않습니다.
 */
@Injectable()
export class HttpAiPipelineClient implements AiPipelineClient {
  private readonly baseUrl = (process.env.AI_PIPELINE_URL ?? '').replace(
    /\/+$/,
    '',
  );
  private readonly token = process.env.AI_PIPELINE_TOKEN ?? '';

  get enabled(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  async listBooks(): Promise<PipelineBookSummary[]> {
    const books = await this.get('/v1/books');
    if (!Array.isArray(books)) {
      throw new Error('파이프라인 책 목록 응답이 배열이 아닙니다.');
    }
    return books.filter(
      (book): book is PipelineBookSummary =>
        typeof book === 'object' &&
        book !== null &&
        typeof (book as PipelineBookSummary).id === 'string',
    );
  }

  getBook(id: string): Promise<unknown> {
    return this.get(`/v1/books/${encodeURIComponent(id)}`);
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(PIPELINE_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`파이프라인 ${path} 응답 ${response.status}`);
    }
    return response.json();
  }
}
