// 보호자 대시보드 문구. 출처: AI 파트 guardian-dashboard-content(v2 카탈로그)·example-response(v3).
// TODO: 관찰·근거·회복 문구 틀은 v3 예시 1건에서 추론한 것입니다. AI 파트의 규칙별 전체 목록을 받으면 교체합니다.

export type AreaId = 'cause' | 'emotion' | 'sequence' | 'facts' | 'gist';

export type AreaState =
  | 'needsSupport'
  | 'practicing'
  | 'supported'
  | 'insufficientData'
  | 'notAssessable'
  | 'notObserved';

export const AREA_ORDER: readonly AreaId[] = [
  'cause',
  'emotion',
  'sequence',
  'facts',
  'gist',
];

/** 빈 그룹은 응답에서 뺍니다 */
export const GROUP_ORDER: readonly AreaState[] = [
  'needsSupport',
  'practicing',
  'supported',
  'insufficientData',
  'notAssessable',
  'notObserved',
];

export const GROUP_TITLES: Record<AreaState, string> = {
  needsSupport: '함께 연습해 봐요',
  practicing: '연습하며 살펴보고 있어요',
  supported: '첫 답에서 스스로 해결했어요',
  insufficientData: '기록을 더 모으고 있어요',
  notAssessable: '아직 판정할 수 없어요',
  notObserved: '아직 살펴보지 않은 부분',
};

export const RULE_IDS: Record<AreaState, string> = {
  needsSupport: 'repeated_non_independent',
  practicing: 'mixed_observations',
  supported: 'mostly_independent',
  // 아래 두 개는 v3 예시에 없어 백엔드가 정한 이름입니다.
  insufficientData: 'insufficient_records',
  notAssessable: 'no_usable_grading',
  notObserved: 'no_activity',
};

export const CHILD_NAME_FALLBACK = '우리 아이';

export const HEADER_COPY = {
  title: (childName: string) => `${childName}의 읽기 기록`,
  hasSessions: (count: number) =>
    `이 기간에 ${count}번의 이야기 시간을 보냈어요.`,
  noSessions:
    '이 기간에는 완료한 이야기 기록이 아직 없어요. 첫 이야기를 함께 읽으면 기록이 쌓이기 시작해요.',
};

export const NOTICE =
  '이 안내는 해당 기간에 풀어본 문제의 기록을 정리한 결과예요. 문구 선택에 사용하는 문제 수와 비율은 서비스 운영 기준이며, 표준화된 능력 평가나 진단 기준은 아니에요.';

export interface AreaCounts {
  observed: number;
  valid: number;
  independent: number;
  assisted: number;
  partial: number;
  incorrect: number;
  nonIndependent: number;
}

/** 판정된 상태의 관찰 문구(v3 예시에서 추론) */
export const OBSERVATION_COPY: Partial<
  Record<AreaState, (title: string, c: AreaCounts) => string>
> = {
  needsSupport: (title, c) =>
    `${title} ${c.valid}문제 중 ${c.nonIndependent}문제는 첫 답에서 도움 없이 정답에 도달하지 못했어요. 어떤 부분을 다시 살펴볼지 함께 찾아봐 주세요.`,
  practicing: (title, c) =>
    `${title} ${c.valid}문제 중 ${c.independent}문제를 첫 답에서 도움 없이 맞혔어요. 나머지 문제도 함께 살펴봐 주세요.`,
  supported: (title, c) =>
    `${title} ${c.valid}문제 중 ${c.independent}문제를 첫 답에서 도움 없이 맞혔어요.`,
  notAssessable: (title, c) =>
    `${title} 활동은 ${c.observed}개 있지만, 이번 판정에 사용할 수 있는 첫 응답 기록이 아직 없어요.`,
};

export const EVIDENCE_COPY = (c: AreaCounts) =>
  `확인한 ${c.valid}문제의 첫 답: 도움 없이 정답 ${c.independent}개, 도움받고 정답 ${c.assisted}개, 부분 정답 ${c.partial}개, 오답 ${c.incorrect}개예요.`;

export const RECOVERY_COPY = {
  withoutHint: (n: number) =>
    `첫 답에서 틀린 문제 중 ${n}개는 힌트 없이 다시 풀어 맞혔어요.`,
  withHint: (n: number) =>
    `첫 답에서 틀린 문제 중 ${n}개는 힌트를 본 뒤 맞혔어요.`,
  withoutVerified: (n: number) =>
    `첫 답에서 틀린 문제 중 ${n}개는 정답 공개 전에 맞힌 기록이 없어요.`,
};

interface AreaCopy {
  title: string;
  reference: { label: string; url: string };
  /** 기록 부족·활동 없음 상태의 관찰 문구(v2 카탈로그) */
  observations: { insufficientData: string; notObserved: string };
  /** 제안 문구(v2 카탈로그). v3 예시에서 연습하며 관찰은 needsSupport, 판정 불가는 insufficientData 문구를 씁니다 */
  suggestions: Record<
    'supported' | 'needsSupport' | 'insufficientData' | 'notObserved',
    string
  >;
}

export const AREA_COPY: Record<AreaId, AreaCopy> = {
  cause: {
    title: '원인 이해',
    reference: {
      label: '읽기 이해 지도법 더 보기',
      url: 'https://onlit.org/wp-content/uploads/2023/08/Oakhill-Cain-Supporting-Reading-Comprehension-Development.pdf',
    },
    observations: {
      insufficientData:
        '사건의 원인을 어떻게 이해하는지 살펴볼 기록을 더 모으고 있어요.',
      notObserved:
        '이 기간에는 사건의 원인을 설명하는 활동 기록이 아직 없어요.',
    },
    suggestions: {
      supported:
        '아이가 찾은 이유를 듣고, "이야기에서 어떤 부분이 힌트였어?" 하고 물어봐 주세요.',
      needsSupport:
        '정답을 바로 알려주기 전에, "이야기에 힌트가 있었는데 어디였을까?" 하고 같이 다시 찾아봐 주세요.',
      insufficientData:
        '다음 이야기를 읽고 "왜 그런 일이 생겼을까?" 하고 가볍게 물어봐 주세요.',
      notObserved:
        '이야기를 읽은 뒤 사건이 일어난 이유를 함께 이야기해 보세요.',
    },
  },
  emotion: {
    title: '마음 이해',
    reference: {
      label: '감정 대화 연구 더 보기',
      url: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00670/full',
    },
    observations: {
      insufficientData:
        '인물의 마음과 그 이유를 어떻게 이해하는지 살펴볼 기록을 더 모으고 있어요.',
      notObserved:
        '이 기간에는 인물의 마음을 이야기하는 활동 기록이 아직 없어요.',
    },
    suggestions: {
      supported:
        '"네가 그 인물이라면 어떤 마음일까?" 하고 아이의 생각을 들어주세요.',
      needsSupport:
        '"어떤 마음이었을까?" 하고 물어본 뒤, "어떤 일 때문에 그렇게 느꼈을까?" 하고 함께 짚어봐 주세요.',
      insufficientData:
        '인물의 표정이나 행동을 보고 어떤 마음일지 함께 이야기해 보세요.',
      notObserved:
        '다음 이야기에서 기억에 남는 인물을 골라 마음을 함께 이야기해 보세요.',
    },
  },
  sequence: {
    title: '순서 정리',
    reference: {
      label: 'Reading Rockets — 이야기 순서 지도법',
      url: 'https://www.readingrockets.org/classroom/classroom-strategies/story-sequence',
    },
    observations: {
      insufficientData:
        '사건의 순서를 어떻게 정리하는지 살펴볼 기록을 더 모으고 있어요.',
      notObserved:
        '이 기간에는 사건의 순서를 정리하는 활동 기록이 아직 없어요.',
    },
    suggestions: {
      supported:
        '"처음에는? 그다음에는? 마지막에는?" 하고 아이가 이야기를 들려주게 해주세요.',
      needsSupport:
        '"먼저 뭐였지? 그다음엔?" 하고 순서를 나타내는 말을 아이가 직접 소리 내어 말해보게 해주세요.',
      insufficientData:
        '읽은 이야기에서 처음과 마지막에 있었던 일을 함께 떠올려 보세요.',
      notObserved: '다음 이야기를 읽고 기억나는 일을 순서대로 함께 말해보세요.',
    },
  },
  facts: {
    title: '인물과 사건',
    reference: {
      label: 'Reading Rockets — 이야기 지도 자료',
      url: 'https://www.readingrockets.org/classroom/classroom-strategies/story-maps',
    },
    observations: {
      insufficientData:
        '인물과 사건을 어떻게 파악하는지 살펴볼 기록을 더 모으고 있어요.',
      notObserved:
        '이 기간에는 인물과 사건을 짚어보는 활동 기록이 아직 없어요.',
    },
    suggestions: {
      supported:
        '지금처럼 편하게 봐주시고, 가끔 "지금 누가 나왔지?" 정도만 가볍게 물어봐 주세요.',
      needsSupport:
        '"누가 나왔지? 어떤 일이 있었지?" 하고 한 가지씩 물어보며 이야기에서 함께 찾아봐 주세요.',
      insufficientData:
        '이야기를 읽고 기억에 남는 인물이나 사건을 자유롭게 말해보게 해주세요.',
      notObserved:
        '다음 이야기에서 누가 나왔고 어떤 일이 있었는지 함께 이야기해 보세요.',
    },
  },
  gist: {
    title: '요약과 제목',
    reference: {
      label: 'IES REL — 요약과 다시 말하기 자료',
      url: 'https://ies.ed.gov/ncee/rel/reading-comprehension-k-3/teacher-pd-module1',
    },
    observations: {
      insufficientData:
        '이야기의 중심 내용을 어떻게 표현하는지 살펴볼 기록을 더 모으고 있어요.',
      notObserved:
        '이 기간에는 요약하거나 제목을 붙이는 활동 기록이 아직 없어요.',
    },
    suggestions: {
      supported:
        '제목을 바로 고쳐주기보다 "이 이야기, 한마디로 하면 뭐야?" 하고 먼저 물어봐 주세요.',
      needsSupport:
        '"가장 중요한 일은 뭐였을까?" 하고 먼저 고른 뒤, 그 일을 짧게 말하거나 제목으로 붙여보게 해주세요.',
      insufficientData: '아이가 기억하는 중요한 일 한 가지를 먼저 들어주세요.',
      notObserved:
        '다음 이야기를 다 읽은 뒤 아이가 짧은 제목을 붙여보게 해주세요.',
    },
  },
};

/** 상태별로 쓸 제안 문구 키 */
export const SUGGESTION_KEY: Record<AreaState, keyof AreaCopy['suggestions']> =
  {
    needsSupport: 'needsSupport',
    practicing: 'needsSupport',
    supported: 'supported',
    insufficientData: 'insufficientData',
    notAssessable: 'insufficientData',
    notObserved: 'notObserved',
  };
