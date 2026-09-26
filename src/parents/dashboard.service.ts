import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DASHBOARD_MAX_PERIOD_DAYS,
  DASHBOARD_PERIOD_DAYS,
  DASHBOARD_POLICY_VERSION,
  DASHBOARD_PROFILE_ID,
  DASHBOARD_SPEC_VERSION,
} from '../common/constants/dashboard';
import { todayKst } from '../common/utils/kst-date.util';
import { DashboardDto, DashboardQueryDto } from './dto/parents.dto';
import {
  AREA_ORDER,
  CHILD_NAME_FALLBACK,
  GROUP_ORDER,
  GROUP_TITLES,
  HEADER_COPY,
  NOTICE,
} from './guardian-copy';
import {
  PARENT_REPOSITORY,
  type DashboardPeriod,
  type IParentRepository,
} from './interfaces/parent-repository.interface';
import { assessArea } from './utils/dashboard.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
const isRealDate = (date: string) =>
  !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);

/** 조회 기간(Asia/Seoul, 양 끝 포함). 생략하면 오늘까지 최근 14일 */
export function resolvePeriod(
  query: DashboardQueryDto,
  today = todayKst(),
): DashboardPeriod {
  const endDate = query.endDate ?? today;
  const startDate =
    query.startDate ?? shiftDate(endDate, -(DASHBOARD_PERIOD_DAYS - 1));
  if (!isRealDate(startDate) || !isRealDate(endDate)) {
    throw new BadRequestException('존재하지 않는 날짜입니다.');
  }
  const days = dayNumber(endDate) - dayNumber(startDate) + 1;
  if (days < 1) {
    throw new BadRequestException('시작일은 종료일보다 늦을 수 없습니다.');
  }
  if (days > DASHBOARD_MAX_PERIOD_DAYS) {
    throw new BadRequestException(
      `조회 기간은 최대 ${DASHBOARD_MAX_PERIOD_DAYS}일입니다.`,
    );
  }
  return { startDate, endDate };
}

/**
 * 보호자 대시보드(AI 파트 명세 v3, AI 미사용): 기간 안에 완료한 책의 풀이 기록으로 영역별 상태를 판정하고
 * 상태에 맞는 문구를 골라 돌려줍니다. 프론트는 받은 문구를 그대로 표시합니다.
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(PARENT_REPOSITORY)
    private readonly repository: IParentRepository,
  ) {}

  async dashboard(
    studentId: number,
    query: DashboardQueryDto,
  ): Promise<DashboardDto> {
    const period = resolvePeriod(query);
    const source = await this.repository.getDashboardSource(studentId, period);
    if (!source) throw new NotFoundException('학생을 찾을 수 없습니다.');

    const childName = source.student.name.trim() || CHILD_NAME_FALLBACK;
    const sessionCount = source.books.length;
    const areas = AREA_ORDER.map((id) => assessArea(id, source.books));

    return {
      specVersion: DASHBOARD_SPEC_VERSION,
      policyVersion: DASHBOARD_POLICY_VERSION,
      childId: String(source.student.id),
      availability: 'available',
      period: { ...period, timeZone: 'Asia/Seoul' },
      profileId: DASHBOARD_PROFILE_ID,
      header: {
        title: HEADER_COPY.title(childName),
        periodLabel: `${period.startDate} – ${period.endDate}`,
        sessionCount,
        summary:
          sessionCount > 0
            ? HEADER_COPY.hasSessions(sessionCount)
            : HEADER_COPY.noSessions,
      },
      areas: areas.map((area) => ({
        ...area,
        metrics: { ...area.metrics },
      })),
      groups: GROUP_ORDER.map((state) => ({
        id: state,
        title: GROUP_TITLES[state],
        areaIds: areas.filter((a) => a.state === state).map((a) => a.id),
      })).filter((group) => group.areaIds.length > 0),
      notice: NOTICE,
      errorCode: null,
      reflections: source.books
        .filter((book) => book.reflection)
        .map((book) => ({
          assignmentId: book.assignmentId,
          title: book.title,
          transcript: book.reflection!.transcript,
          durationMs: book.reflection!.durationMs,
          completedAt: book.completedAt,
        })),
    };
  }
}
