import { Injectable } from '@nestjs/common';
import { PIPELINE_REQUEST_TIMEOUT_MS } from '../common/constants/inbox.constants';

export const AI_PIPELINE_CLIENT = Symbol('AI_PIPELINE_CLIENT');

export interface PipelineBookSummary {
  id: string;
  title: string;
}

/** random 모드 생성 요청 본문(AI 파트 명세 RandomDiscoveryRequest) */
export interface RandomJobRequest {
  mode: 'random';
  exclude_book_ids: string[];
  exclude_source_urls: string[];
}

/** GET /v1/jobs/{id}. 생성 상태(status)와 전달 상태(delivery.status)는 따로 봅니다 */
export interface PipelineJob {
  id: string;
  /** queued·running·succeeded·rejected·error */
  status: string;
  error?: string | null;
  delivery?: { status?: string } | null;
  result?: { books?: { id: string; status?: string }[] } | null;
}

export interface JobSubmitResult {
  /** 202 새 접수, 200 같은 키·같은 본문 재접수, 409 같은 키에 다른 본문, 400 잘못된 요청 */
  httpStatus: number;
  job: PipelineJob | null;
  error: string | null;
}

/** AI 파트 생성 파이프라인 API(production_api.py, Tailscale 사설망) */
export interface AiPipelineClient {
  /** AI_PIPELINE_URL·AI_PIPELINE_TOKEN이 모두 있을 때만 true */
  readonly enabled: boolean;
  listBooks(): Promise<PipelineBookSummary[]>;
  /** 책 JSON 원본(동화 기준 형식, docs/samples/folkency-5747.json) */
  getBook(id: string): Promise<unknown>;
  submitJob(
    body: RandomJobRequest,
    idempotencyKey: string,
  ): Promise<JobSubmitResult>;
  getJob(jobId: string): Promise<PipelineJob>;
  /** 전달 failed·waiting_configuration 작업의 같은 결과 재전송(생성 재실행 아님) */
  retryDelivery(jobId: string): Promise<{ httpStatus: number; body: unknown }>;
}

/**
 * 토큰은 환경변수에서만 읽고 로그·오류 메시지에 넣지 않습니다.
 * 네트워크 오류·제한 시간 초과는 예외로 올리고, HTTP 응답 코드는 호출한 쪽이 판단합니다.
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
    const books = await this.getOk('/v1/books');
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
    return this.getOk(`/v1/books/${encodeURIComponent(id)}`);
  }

  async submitJob(
    body: RandomJobRequest,
    idempotencyKey: string,
  ): Promise<JobSubmitResult> {
    const { status, json } = await this.request('POST', '/v1/jobs', {
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    const ok = status === 200 || status === 202;
    return {
      httpStatus: status,
      job: ok ? (json as PipelineJob) : null,
      error: ok ? null : errorText(json, status),
    };
  }

  async getJob(jobId: string): Promise<PipelineJob> {
    return (await this.getOk(
      `/v1/jobs/${encodeURIComponent(jobId)}`,
    )) as PipelineJob;
  }

  async retryDelivery(
    jobId: string,
  ): Promise<{ httpStatus: number; body: unknown }> {
    const { status, json } = await this.request(
      'POST',
      `/v1/jobs/${encodeURIComponent(jobId)}/delivery/retry`,
    );
    return { httpStatus: status, body: json };
  }

  private async getOk(path: string): Promise<unknown> {
    const { status, json } = await this.request('GET', path);
    if (status < 200 || status >= 300) {
      throw new Error(`파이프라인 ${path} 응답 ${status}`);
    }
    return json;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      ...options.headers,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(PIPELINE_REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { error: text.slice(0, 200) };
    }
    return { status: response.status, json };
  }
}

function errorText(json: unknown, status: number): string {
  const error =
    typeof json === 'object' && json !== null && 'error' in json
      ? String((json as { error: unknown }).error)
      : '';
  return `HTTP ${status}${error ? `: ${error}` : ''}`;
}
