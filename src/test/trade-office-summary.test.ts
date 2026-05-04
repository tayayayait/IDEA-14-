import { describe, expect, it } from "vitest";
import { buildTradeOfficeSummary } from "@/lib/trade-office-summary";

describe("trade office summary", () => {
  it("summarizes Beijing trade office fields into a more detailed Korean summary", () => {
    const summary = buildTradeOfficeSummary({
      title: "Trade office contact: 베이징 무역관",
      officeName: "베이징 무역관",
      officeAddress:
        "베이징 무역관: 위치: Beijing Puxiang Zhongxin 29th Floor, Hongtadongjie, Wangjing, Chaoyang District, Beijing",
      airportRouteText:
        "공항 접근: 공항 기준 1km, 대표 소요 약 7분, 이동수단 택시, AirTrain/지하철, 버스.",
    });

    expect(summary).toBe(
      "베이징 무역관은 Beijing Puxiang Zhongxin 29th Floor, Hongtadongjie, Wangjing, Chaoyang District, Beijing에 있습니다. 공항 접근은 약 1km 거리, 약 7분 소요 기준입니다. 이동수단은 택시, AirTrain/지하철, 버스입니다.",
    );
    expect(summary.split(". ").length).toBeLessThanOrEqual(3);
    expect(summary).not.toContain("Trade office contact");
    expect(summary).not.toMatch(/베이징 무역관.*베이징 무역관.*베이징 무역관/);
  });

  it("cleans existing Guangzhou stored summaries without exposing raw labels or source URLs", () => {
    const summary = buildTradeOfficeSummary({
      title: "Trade office contact: 광저우 무역관",
      summary:
        "광저우 무역관: 광저우 무역관: 위치: 2904-2907A Teem Tower, No.208 TianHe Rd., TianHe Dist, GuangZhou, China (중문: 廣州市天河區天河路 208...). 공항 접근: 공항 기준 약 50km, 이동수단 택시, 버스. https://example.com",
    });

    expect(summary).toContain("광저우 무역관은 2904-2907A Teem Tower");
    expect(summary).toContain("공항 접근은 약 50km 거리 기준입니다.");
    expect(summary).toContain("이동수단은 택시, 버스입니다.");
    expect(summary).not.toContain("Trade office contact");
    expect(summary).not.toContain("위치:");
    expect(summary).not.toContain("공항 접근:");
    expect(summary).not.toContain("http");
    expect(summary).not.toMatch(/광저우 무역관.*광저우 무역관.*광저우 무역관/);
  });

  it("omits missing location text for legacy route-only summaries", () => {
    const summary = buildTradeOfficeSummary({
      title: "무역관 연락: 베이징 무역관",
      summary:
        "베이징 무역관 위치 정보 없음. 공항 접근은 약 1km 거리, 약 7분 소요 기준입니다. 이동수단은 택시, AirTrain/지하철, 버스입니다.",
    });

    expect(summary).toBe(
      "베이징 무역관의 공항 접근은 약 1km 거리, 약 7분 소요 기준입니다. 이동수단은 택시, AirTrain/지하철, 버스입니다.",
    );
    expect(summary).not.toContain("위치 정보 없음");
  });

  it("uses an explicit airport fallback when no route details are available", () => {
    const summary = buildTradeOfficeSummary({
      officeName: "칭다오 무역관",
      officeAddress: "주소: Room 2102, Qilu Plaza, Qingdao",
    });

    expect(summary).toBe(
      "칭다오 무역관은 Room 2102, Qilu Plaza, Qingdao에 있습니다. 공항 이동 정보 없음.",
    );
  });

  it("summarizes New York office CSV text without exposing source links", () => {
    const summary = buildTradeOfficeSummary({
      title: "무역관 연락: 뉴욕 무역관",
      summary:
        "ㅇ 주소: 460 Park Avenue, 14th Floor, New York, NY 10022 " +
        "ㅇ 전화번호: +1-212-826-0900 ㅇ 이메일: kotrakbcny@gmail.com " +
        "ㅇ Manhattan 57th Street, Park Avenue의 교차 지점에 있으며 JFK 공항에서 북서쪽으로 약 15마일 정도 지역에 위치해 있다. " +
        "ㅇ 택시이용 - 요금: 콜택시 - $ 70.00+기타 통행료 및 수수료+10~20%(팁) - 소요 시간: 약 1시간 " +
        "ㅇ 공항 셔틀버스 이용 - 요금 : $19.00 - 소요시간 : 약 1시간 20분 " +
        "ㅇ 공항 Air Train 이용 - 요금: $ 8.50 - Train 서비스 가이드: http://www.panynj.gov/airports/jfk-airtrain.html " +
        "※ 방문 전 이메일 또는 유선으로 방문 일정을 사전에 협의하는 것이 좋다.",
    });

    expect(summary).toContain("뉴욕 무역관은 460 Park Avenue");
    expect(summary).toContain("공항 접근은 JFK 공항 기준으로 약 15마일 거리, 약 1시간 소요입니다.");
    expect(summary).toContain("이동수단은 택시, 공항 셔틀, AirTrain/지하철이며 비용 단서는 $70.00+, $19.00, $8.50입니다.");
    expect(summary).toContain("방문 전 일정 확인이 권장됩니다.");
    expect(summary).not.toContain("위치:");
    expect(summary).not.toContain("연락:");
    expect(summary).not.toContain("http");
  });

  it("summarizes Los Angeles office access and rideshare guidance", () => {
    const summary = buildTradeOfficeSummary({
      title: "무역관 연락: 로스앤젤레스 무역관",
      summary:
        "ㅇ 주소: 4801 Wilshire Blvd. Suite 104, Los Angeles, CA 90010 " +
        "ㅇ 전화번호: +1-323-954-9500 ㅇ 이메일: info.kotrala@gmail.com " +
        "ㅇ LA 무역관은 LA 국제공항에서 북동쪽으로 약 10.1마일 (약 16.2킬로미터) 정도 떨어져 있다. " +
        "ㅇ 방법 1(택시 및 라이드셰어링 이용) 택시 및 Uber&middot;Lyft 이용객들은 LAX-it으로 이동 필요. " +
        "소요시간은 대략 30분이며 요금 외 Tip 별도. 방문 전 이메일 또는 유선으로 방문 일정을 사전에 협의하는 것을 권장.",
    });

    expect(summary).toContain("로스앤젤레스 무역관은 4801 Wilshire Blvd.");
    expect(summary).toContain("공항 접근은 LA 국제공항 기준으로 약 10.1마일 거리, 대략 30분 소요입니다.");
    expect(summary).toContain("이동수단은 택시, Uber/Lyft이며 LAX-it 이동 안내가 있습니다.");
    expect(summary).toContain("방문 전 일정 확인이 권장됩니다.");
    expect(summary).not.toContain("연락:");
  });

  it("removes phone, fax, and homepage labels from Tokyo office address fields", () => {
    const summary = buildTradeOfficeSummary({
      title: "무역관 연락: 도쿄 무역관",
      officeName: "도쿄 무역관",
      officeAddress:
        "ㅇ 주소: 東京都千代田区丸の内3-4-1 新国際ビル 9F(〒100-0005) " +
        "ㅇ 전화번호: +81-3-3214-6951 (FAX: +81-3-3214-6950) ㅇ 홈페이지:",
      airportRouteText:
        "공항무역관이동: 나리타 공항 기준 약 75분 소요, 이동수단 택시, 버스. 도쿄역 및 주요 터미널을 경유할 수 있음.",
    });

    expect(summary).toContain("도쿄 무역관은 東京都千代田区丸の内3-4-1 新国際ビル 9F(〒100-0005)에 있습니다.");
    expect(summary).toContain("공항 접근은 나리타 공항 기준으로 약 75분 소요입니다.");
    expect(summary).toContain("이동수단은 택시, 버스입니다.");
    expect(summary).not.toContain("ㅇ 주소");
    expect(summary).not.toContain("전화번호");
    expect(summary).not.toContain("FAX");
    expect(summary).not.toContain("홈페이지");
  });

  it("uses AI trade office summaries as the primary display text", () => {
    const summary = buildTradeOfficeSummary({
      title: "무역관 연락: 도쿄 무역관",
      officeName: "도쿄 무역관",
      summary_source: "ai",
      summary:
        "Trade office contact: 도쿄 무역관은 東京都千代田区丸の内3-4-1 新国際ビル 9F에 위치합니다. " +
        "나리타 공항에서는 리무진버스 또는 JR 나리타익스프레스로 도쿄역·유라쿠쵸역을 경유해 이동할 수 있습니다. " +
        "전화번호: +81-3-3214-6951 FAX: +81-3-3214-6950 홈페이지: http://kotra.or.jp/",
      officeAddress: "주소: fallback address",
      airportRouteText: "공항무역관이동: fallback route",
    });

    expect(summary).toContain("도쿄 무역관은 東京都千代田区丸の内3-4-1 新国際ビル 9F에 위치합니다.");
    expect(summary).toContain("나리타 공항에서는 리무진버스 또는 JR 나리타익스프레스");
    expect(summary).not.toContain("fallback address");
    expect(summary).not.toContain("fallback route");
    expect(summary).not.toContain("Trade office contact");
    expect(summary).not.toContain("전화번호");
    expect(summary).not.toContain("FAX");
    expect(summary).not.toContain("홈페이지");
    expect(summary).not.toContain("http");
  });

  it("keeps rule fallback conservative instead of inventing missing location text", () => {
    const summary = buildTradeOfficeSummary({
      title: "무역관 연락: 민스크 무역관",
      officeName: "민스크 무역관",
      officeAddress:
        "코로나19 이후 우편 운송 제한 확인 필요. ㅇ 주소: Office 509, 70 Myasnikova street, Minsk, 220030, Republic of Belarus " +
        "ㅇ 전화: +375-17-200-0168 ㅇ 팩스: +375-17-200-0156 ㅇ 이메일: kotra@kotraminsk.by",
      airportRouteText:
        "ㅇ 공항 출발 시 공항에서 무역관까지 거리는 약 32km이며, 차량으로 이동 시 40~50분가량 소요된다. " +
        "택시 이용을 추천하며, 벨라루스 현지화로 40~50루블(약 16~20달러)이다. 방문 전 이메일 또는 유선으로 방문 일정을 사전에 협의하는 것이 좋다.",
    });

    expect(summary).toContain("민스크 무역관은 Office 509, 70 Myasnikova street, Minsk, 220030, Republic of Belarus에 있습니다.");
    expect(summary).toContain("공항 이동 안내:");
    expect(summary).toContain("약 32km");
    expect(summary).not.toContain("위치 정보 없음");
    expect(summary).not.toContain("전화:");
    expect(summary).not.toContain("팩스");
    expect(summary).not.toContain("이메일");
  });

  it("does not cut long address and route text in the middle of a sentence", () => {
    const summary = buildTradeOfficeSummary({
      title: "무역관 연락: 이스탄불 무역관",
      officeName: "이스탄불 무역관",
      officeAddress:
        "무역관주소: Korea Trade Center, Maslak, AKSOY PLAZA, Ahi Evran Cd. NO: 6 D:KAT. 3, 34398 Sariyer/Istanbul에 있습니다",
      airportRouteText:
        "공항무역관이동: 공항 이용 안내: 공항에서 이스탄불 시내로 이동할 수 있는 대중교통은 버스와 택시이며, 지하철 노선은 없다. 대중교통 활용 방법으로는 공항에서 공항버스를 이용하면 제1여객터미널 중앙버스 탑승지로 이동해야 한다. 공항버스는 총 20개 노선이 있으며 무역관으로 오려면 베식타시가 종점인 15번 승차장에서 타야 한다. 차량은 약 30분 간격으로 출발한다.",
    });

    expect(summary).toContain(
      "이스탄불 무역관은 Korea Trade Center, Maslak, AKSOY PLAZA, Ahi Evran Cd. NO: 6 D:KAT. 3, 34398 Sariyer/Istanbul에 있습니다.",
    );
    expect(summary).toContain("차량은 약 30분 간격으로 출발한다.");
    expect(summary).not.toContain("...");
  });

  it("keeps complete sentences from long AI summaries instead of appending ellipsis", () => {
    const summary = buildTradeOfficeSummary({
      title: "무역관 연락: 로스앤젤레스 무역관",
      officeName: "로스앤젤레스 무역관",
      summary_source: "ai",
      summary:
        "로스앤젤레스 무역관은 4801 Wilshire Blvd. Suite 104, Los Angeles, CA 90010에 있습니다. LAX 공항에서는 택시와 Uber, Lyft를 이용할 수 있으며 LAX-it 이동 안내를 확인해야 합니다. 방문 전 일정 확인이 권장됩니다.",
    });

    expect(summary).toBe(
      "로스앤젤레스 무역관은 4801 Wilshire Blvd. Suite 104, Los Angeles, CA 90010에 있습니다. LAX 공항에서는 택시와 Uber, Lyft를 이용할 수 있으며 LAX-it 이동 안내를 확인해야 합니다. 방문 전 일정 확인이 권장됩니다.",
    );
    expect(summary).not.toContain("...");
  });
});
