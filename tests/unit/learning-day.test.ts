import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { learningDayKey, learningDaysBetween, learningDayStart, nextLearningDayStart } from '../../src/lib/learning/day.ts';

/** Часовой пояс процесса на время блока тестов: Node перечитывает TZ при записи. */
function inTimeZone(zone: string) {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = zone;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

/** Местное время: local(2026, 10, 24, 2, 30) — 24 октября 2026, 02:30. */
const local = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();

describe('учебный день в Алматы', () => {
  inTimeZone('Asia/Almaty');

  it('начинается в 4:00: занятие после полуночи относится к прошедшему дню', () => {
    expect(learningDayKey(local(2026, 10, 24, 2, 30))).toBe('2026-10-23');
    expect(learningDayKey(local(2026, 10, 24, 3, 59))).toBe('2026-10-23');
    expect(learningDayKey(local(2026, 10, 24, 4, 0))).toBe('2026-10-24');
    expect(learningDayKey(local(2026, 10, 24, 23, 59))).toBe('2026-10-24');
  });

  it('границы дня и счёт дней', () => {
    const at = local(2026, 10, 24, 22, 58);
    expect(learningDayStart(at)).toBe(local(2026, 10, 24, 4));
    expect(nextLearningDayStart(at)).toBe(local(2026, 10, 25, 4));
    expect(learningDaysBetween(local(2026, 10, 24, 23), local(2026, 10, 25, 3))).toBe(0);
    expect(learningDaysBetween(local(2026, 10, 24, 23), local(2026, 10, 25, 5))).toBe(1);
    expect(learningDaysBetween(local(2026, 12, 31, 12), local(2027, 1, 1, 12))).toBe(1);
  });

  it('час начала дня настраивается', () => {
    expect(learningDayKey(local(2026, 10, 24, 5, 30), 6)).toBe('2026-10-23');
    expect(learningDayKey(local(2026, 10, 24, 0, 30), 0)).toBe('2026-10-24');
  });
});

describe('учебный день при переводе часов (Берлин)', () => {
  inTimeZone('Europe/Berlin');

  it('день перед переходом на зимнее время длится 25 часов, но остаётся одним днём', () => {
    // 25 октября 2026: в 3:00 по летнему часы переводят на 2:00.
    const start = learningDayStart(local(2026, 10, 24, 12));
    const next = nextLearningDayStart(local(2026, 10, 24, 12));
    expect(new Date(start).getHours()).toBe(4);
    expect(new Date(next).getHours()).toBe(4);
    expect((next - start) / 3_600_000).toBe(25);
    expect(learningDayKey(local(2026, 10, 25, 3, 30))).toBe('2026-10-24');
    expect(learningDaysBetween(local(2026, 10, 24, 12), local(2026, 10, 25, 12))).toBe(1);
  });

  it('день перед переходом на летнее время длится 23 часа', () => {
    // 29 марта 2026: в 2:00 часы переводят на 3:00.
    const start = learningDayStart(local(2026, 3, 28, 12));
    const next = nextLearningDayStart(local(2026, 3, 28, 12));
    expect((next - start) / 3_600_000).toBe(23);
    expect(learningDayKey(local(2026, 3, 29, 3, 30))).toBe('2026-03-28');
    expect(learningDayKey(local(2026, 3, 29, 4, 0))).toBe('2026-03-29');
  });
});

describe('смена часового пояса', () => {
  it('один и тот же момент относится к своему учебному дню в каждом поясе', () => {
    const moment = Date.UTC(2026, 9, 24, 23, 30); // 25 октября: 04:30 в Алматы, 01:30 в Берлине
    const previous = process.env.TZ;
    process.env.TZ = 'Asia/Almaty';
    const almaty = learningDayKey(moment);
    process.env.TZ = 'Europe/Berlin';
    const berlin = learningDayKey(moment);
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
    expect(almaty).toBe('2026-10-25');
    expect(berlin).toBe('2026-10-24');
  });
});
