import type { DisasterType, WeatherAlert } from "@/lib/types";

/** 공식 기상특보 열람용 모의 데이터 (UFR-002-001) — 실제 연계 시 기상청 API로 대체 */
export function mockWeatherAlerts(org: string, type: DisasterType, baseTime: string): WeatherAlert[] {
  const now = new Date().toISOString();
  const base = new Date(baseTime);
  const minus = (h: number) => new Date(base.getTime() - h * 3600_000).toISOString();
  const area = org.replace("광역시", "").replace("특별시", "").replace("특별자치도", "");
  if (type === "wildfire") {
    return [
      { id: "wa-1", type: "건조경보", area: `${area} 전역`, issuedAt: minus(20), effectiveAt: minus(18), content: `${area} 지역에 건조경보 발효. 실효습도 25% 이하 지속, 산불 위험 매우 높음.`, source: "기상청", fetchedAt: now },
      { id: "wa-2", type: "강풍주의보", area: `${area} 동해안`, issuedAt: minus(6), effectiveAt: minus(4), content: "순간풍속 20m/s 이상 강풍 예상. 산불 비산화 확산 우려.", source: "기상청", fetchedAt: now },
    ];
  }
  if (type === "heavy_snow") {
    return [
      { id: "wa-1", type: "대설예비특보", area: `${area} 전역`, issuedAt: minus(14), effectiveAt: minus(10), content: "내일 새벽부터 3~8cm, 많은 곳 10cm 이상 적설 예상.", source: "기상청", fetchedAt: now },
      { id: "wa-2", type: "대설주의보", area: `${area} 전역`, issuedAt: minus(3), effectiveAt: minus(2), content: "24시간 신적설 5cm 이상 예상. 도로 결빙 및 교통사고 유의.", source: "기상청", fetchedAt: now },
    ];
  }
  if (type === "typhoon") {
    return [
      { id: "wa-1", type: "태풍예비특보", area: `${area} 전역, 남해동부`, issuedAt: minus(30), effectiveAt: minus(24), content: "제11호 태풍 북상 중. 내일 오전 남해안 상륙 예상.", source: "기상청", fetchedAt: now },
      { id: "wa-2", type: "태풍주의보", area: `${area} 전역`, issuedAt: minus(9), effectiveAt: minus(8), content: "최대풍속 25m/s, 강수량 100~200mm 예상. 해안가 월파 주의.", source: "기상청", fetchedAt: now },
      { id: "wa-3", type: "태풍경보", area: `${area} 전역`, issuedAt: minus(2), effectiveAt: minus(1), content: "태풍경보 발효. 강풍·폭우 동반, 외출 자제 및 저지대 사전대피 권고.", source: "기상청", fetchedAt: now },
    ];
  }
  return [
    { id: "wa-1", type: "호우예비특보", area: `${area} 전역`, issuedAt: minus(16), effectiveAt: minus(12), content: "내일 새벽부터 시간당 30mm 이상의 강한 비. 예상 강수량 80~150mm.", source: "기상청", fetchedAt: now },
    { id: "wa-2", type: "호우주의보", area: `${area} 전역`, issuedAt: minus(5), effectiveAt: minus(4), content: "3시간 누적 60mm 이상 예상. 하상도로·지하차도 침수 유의.", source: "기상청", fetchedAt: now },
    { id: "wa-3", type: "호우경보", area: `${area} 중부·동부`, issuedAt: minus(1), effectiveAt: minus(0.5), content: "3시간 누적 90mm 이상, 12시간 180mm 이상 예상. 산사태·침수 위험 매우 높음.", source: "기상청", fetchedAt: now },
  ];
}

export function mockWeatherSummary(org: string, type: DisasterType, alerts: WeatherAlert[]): string {
  const last = alerts[alerts.length - 1];
  const area = org;
  if (type === "wildfire") {
    return `${area}는 현재 ${last?.type ?? "건조특보"} 발효 중이며 실효습도가 낮고 강풍이 예보되어 산불 발생·확산 위험이 매우 높은 상태입니다. 향후 12시간 동안 풍속이 강해질 것으로 보여 진화작업 시 비산화에 대비가 필요합니다.`;
  }
  if (type === "heavy_snow") {
    return `${area} 전역에 ${last?.type ?? "대설주의보"}가 발효되어 있으며 새벽 시간대 적설이 집중될 전망입니다. 도로 결빙과 출근길 교통 혼잡이 예상되어 제설자재 전진배치와 취약도로 통제 준비가 필요합니다.`;
  }
  if (type === "typhoon") {
    return `${area}는 ${last?.type ?? "태풍경보"} 발효 중으로, 최대풍속 25m/s 이상의 강풍과 100~200mm의 많은 비가 예상됩니다. 해안가 월파, 옥외광고물 낙하, 저지대 침수 우려가 크며 야간에 최근접할 것으로 전망됩니다.`;
  }
  return `${area}는 ${last?.type ?? "호우주의보"} 발효 중이며 시간당 30mm 이상의 강한 비가 이어질 전망입니다. 하상도로·지하차도 침수와 산사태 위험이 높아 사전 통제와 배수펌프장 가동 점검이 필요합니다.`;
}
