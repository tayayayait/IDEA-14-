# AI 산단수출 코파일럿 XML 예시

아래 XML은 `상세서.md`의 전체 구조를 AI가 명확히 해석할 수 있도록 계층형으로 재구성한 예시다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<projectSpecification
  id="ai-sandan-export-copilot"
  language="ko"
  documentType="implementation-specification"
  lastVerifiedDate="2026-04-22">

  <documentBasis section="0">
    <title>문서 기준</title>
    <purpose>개발자와 디자이너가 별도 해석 없이 화면, UX, 컴포넌트, 상태, 예외 처리를 구현하기 위한 기준</purpose>
    <scope>MVP 기준 웹 앱</scope>
    <apiScope>P0 필수 API 10개만 사용</apiScope>
    <lastVerifiedDate>2026-04-22</lastVerifiedDate>
    <excludedScope>
      <item>결제</item>
      <item>회원 과금</item>
      <item>실제 전략물자 최종 판정</item>
      <item>실제 인증 적합성 최종 판정</item>
      <item>개별 바이어 신용평가</item>
    </excludedScope>
  </documentBasis>

  <productDefinition section="1">
    <title>제품 정의</title>

    <serviceOverview section="1.1">
      <projectName>AI 산단수출 코파일럿</projectName>
      <serviceType>공공데이터 기반 AI 수출 준비 지원 웹 서비스</serviceType>
      <coreUsers>
        <user>산업단지 입주 중소·중견 제조기업</user>
        <user>수출 초보기업</user>
        <user>지자체·산단 기업지원 담당자</user>
        <user>무역 컨설턴트</user>
      </coreUsers>
      <coreOutputs>
        <output>추천 수출국 Top 3</output>
        <output>인증·규제 체크리스트</output>
        <output>결제 리스크</output>
        <output>전략물자 검토 플래그</output>
        <output>제품안전·리콜 유사사례</output>
        <output>PDF 실행 리포트</output>
      </coreOutputs>
      <coreFlow>기업 확인 -&gt; 품목 확인 -&gt; 국가 추천 -&gt; 인증/규제 -&gt; 결제위험 -&gt; 전략물자 -&gt; 제품안전 -&gt; 실행 리포트</coreFlow>
    </serviceOverview>

    <p0Apis section="1.2">
      <api number="1">
        <name>한국산업단지공단_공장등록생산정보조회서비스</name>
        <provider>한국산업단지공단</provider>
        <screenUsage>기업 검색, 기업 프로파일</screenUsage>
      </api>
      <api number="2">
        <name>KOTRA_국가정보</name>
        <provider>대한무역투자진흥공사</provider>
        <screenUsage>수출국 추천, 국가 상세</screenUsage>
      </api>
      <api number="3">
        <name>KOTRA_해외시장뉴스</name>
        <provider>대한무역투자진흥공사</provider>
        <screenUsage>수출국 추천, 시장 근거</screenUsage>
      </api>
      <api number="4">
        <name>KOTRA_해외인증정보</name>
        <provider>대한무역투자진흥공사</provider>
        <screenUsage>해외인증 체크리스트</screenUsage>
      </api>
      <api number="5">
        <name>KOTRA_수입규제품목 정보</name>
        <provider>대한무역투자진흥공사</provider>
        <screenUsage>수입규제 체크리스트</screenUsage>
      </api>
      <api number="6">
        <name>한국무역보험공사_국별신용등급</name>
        <provider>한국무역보험공사</provider>
        <screenUsage>국가 리스크</screenUsage>
      </api>
      <api number="7">
        <name>한국무역보험공사_국가별 업종별 위험지수</name>
        <provider>한국무역보험공사</provider>
        <screenUsage>업종 리스크</screenUsage>
      </api>
      <api number="8">
        <name>한국무역보험공사_수출결제정보</name>
        <provider>한국무역보험공사</provider>
        <screenUsage>결제 리스크</screenUsage>
      </api>
      <api number="9">
        <name>무역안보관리원_HSK 연계표 정보</name>
        <provider>무역안보관리원</provider>
        <screenUsage>전략물자 검토 플래그</screenUsage>
      </api>
      <api number="10">
        <name>국가기술표준원/SafetyKorea_제품 안전인증 및 리콜 정보</name>
        <provider>산업통상부/국가기술표준원</provider>
        <screenUsage>제품안전·리콜</screenUsage>
      </api>
    </p0Apis>
  </productDefinition>

  <informationArchitecture section="2">
    <title>정보 구조</title>

    <topNavigation section="2.1">
      <menu>
        <label>새 분석</label>
        <path>/projects/new</path>
        <purpose>기업·제품 기반 신규 수출 분석 시작</purpose>
      </menu>
      <menu>
        <label>분석 대시보드</label>
        <path>/projects/{projectId}</path>
        <purpose>추천국가, 리스크, 체크리스트 통합 보기</purpose>
      </menu>
      <menu>
        <label>리포트</label>
        <path>/projects/{projectId}/report</path>
        <purpose>PDF 실행 리포트 미리보기 및 생성</purpose>
      </menu>
      <menu>
        <label>데이터 출처</label>
        <path>/data-sources</path>
        <purpose>사용 API 상태, 조회일, 라이선스 주의 확인</purpose>
      </menu>
    </topNavigation>

    <analysisSteps section="2.2">
      <step number="1">
        <name>기업 확인</name>
        <requiredCompletion>공장 또는 기업 1개 선택</requiredCompletion>
        <nextCondition>회사명, 생산품, 업종 중 2개 이상 확보</nextCondition>
      </step>
      <step number="2">
        <name>품목 확인</name>
        <requiredCompletion>제품명과 HS/HSK 후보 입력</requiredCompletion>
        <nextCondition>사용자가 분석 기준 품목을 확정</nextCondition>
      </step>
      <step number="3">
        <name>국가 추천</name>
        <requiredCompletion>후보국 3개 이상 생성</requiredCompletion>
        <nextCondition>추천국 Top 3 계산 완료</nextCondition>
      </step>
      <step number="4">
        <name>인증·규제</name>
        <requiredCompletion>후보국별 인증·수입규제 조회</requiredCompletion>
        <nextCondition>최소 1개 국가 상세 확인 가능</nextCondition>
      </step>
      <step number="5">
        <name>리스크 분석</name>
        <requiredCompletion>국가·업종·결제 위험 조회</requiredCompletion>
        <nextCondition>위험도 라벨 산출</nextCondition>
      </step>
      <step number="6">
        <name>안전·통제</name>
        <requiredCompletion>전략물자 플래그와 제품안전 유사사례 조회</requiredCompletion>
        <nextCondition>검토 결과 표시</nextCondition>
      </step>
      <step number="7">
        <name>리포트</name>
        <requiredCompletion>요약, 근거, 다음 실행 과제 생성</requiredCompletion>
        <nextCondition>PDF 미리보기 가능</nextCondition>
      </step>
    </analysisSteps>
  </informationArchitecture>

  <screenSpecifications section="3">
    <title>화면별 상세 구조</title>

    <appShell section="3.1">
      <area name="상단바">
        <spec>높이 64px, 좌측 로고/서비스명, 우측 데이터 상태·저장 버튼·리포트 버튼</spec>
      </area>
      <area name="좌측 단계 내비게이션">
        <spec>데스크톱 248px 고정, 태블릿 72px 아이콘형, 모바일 하단 단계바</spec>
      </area>
      <area name="본문">
        <spec>최대 너비 1440px, 좌우 패딩 데스크톱 32px, 태블릿 24px, 모바일 16px</spec>
      </area>
      <area name="우측 근거 패널">
        <spec>데스크톱 360px, 접기 가능. 태블릿 이하에서는 하단 시트로 전환</spec>
      </area>
      <area name="고정 액션바">
        <spec>화면 하단, 높이 72px. 이전, 저장, 다음, 리포트 생성 배치</spec>
      </area>
    </appShell>

    <screen id="companySearch" section="3.2">
      <name>기업·공장 검색</name>
      <path>/projects/new/company</path>
      <purpose>수출 분석 대상 제조기업과 공장 정보 확정</purpose>
      <api>한국산업단지공단_공장등록생산정보조회서비스</api>
      <structure>
        <zone name="헤더">제목: 분석할 기업 또는 공장을 찾으세요. 보조문: 회사명, 공장명, 생산품 중 하나 이상을 입력합니다.</zone>
        <zone name="검색 폼">회사명 입력, 공장명 입력, 지역 선택, 생산품 키워드 입력, 검색 버튼</zone>
        <zone name="검색 결과">표 형태. 컬럼: 회사명, 공장명, 지역, 업종, 생산품, 선택 버튼</zone>
        <zone name="선택 요약">선택된 기업의 주소, 생산품, 업종, 출처, 조회일 표시</zone>
        <zone name="빈 상태">검색 결과 없음, 조건 초기화 버튼, 수동 입력 버튼</zone>
      </structure>
      <formRules>
        <field name="회사명" type="text" required="conditional" limit="2자 이상"/>
        <field name="공장명" type="text" required="conditional" limit="2자 이상"/>
        <field name="지역" type="combobox" required="false" limit="시·도 단위"/>
        <field name="생산품명" type="text" required="conditional" limit="2자 이상"/>
      </formRules>
      <validationRules>
        <rule>회사명, 공장명, 생산품명 중 하나 이상 입력해야 검색 버튼 활성화.</rule>
        <rule>검색 중 버튼 문구는 검색 중으로 변경하고 버튼 비활성화.</rule>
        <rule>API 오류 시 결과 영역에 오류 패널 표시.</rule>
      </validationRules>
    </screen>

    <screen id="productProfile" section="3.3">
      <name>제품·품목 프로파일</name>
      <path>/projects/{projectId}/product</path>
      <purpose>분석 기준 제품과 HS/HSK 후보 확정</purpose>
      <api>무역안보관리원_HSK 연계표 정보</api>
      <structure>
        <zone name="기업 요약 바">선택 기업명, 공장 주소, 대표 생산품, 업종</zone>
        <zone name="제품 입력">제품명, 제품 설명, 주요 부품, 모델명, 목표 시장 메모</zone>
        <zone name="HS/HSK 후보">후보 코드 입력 테이블, 코드 설명, 사용 여부 토글</zone>
        <zone name="AI 후보 제안">제품명·생산품 기반 후보 제안. 근거가 없으면 표시하지 않음</zone>
        <zone name="확정 액션">분석 기준 품목으로 확정 버튼</zone>
      </structure>
      <inputRules>
        <field name="제품명" type="text" required="true" limit="2~80자"/>
        <field name="제품 설명" type="textarea" required="true" limit="20~1000자"/>
        <field name="주요 부품" type="tag-input" required="false" limit="최대 20개, 태그당 30자"/>
        <field name="모델명" type="text" required="false" limit="80자 이하"/>
        <field name="HS/HSK 후보" type="code-input" required="true" limit="숫자 6~10자리"/>
      </inputRules>
      <processingPrinciples>
        <principle>HS/HSK 자동 확정 금지.</principle>
        <principle>AI는 후보와 근거만 제시한다.</principle>
        <principle>사용자가 분석 기준 품목을 선택해야 다음 단계 이동 가능.</principle>
      </processingPrinciples>
    </screen>

    <screen id="countryRecommendationDashboard" section="3.4">
      <name>수출 후보국 추천 대시보드</name>
      <path>/projects/{projectId}/countries</path>
      <purpose>후보국 Top 3와 추천 근거 비교</purpose>
      <apis>
        <api>KOTRA_국가정보</api>
        <api>KOTRA_해외시장뉴스</api>
      </apis>
      <structure>
        <zone name="추천 요약">Top 3 국가 카드, 추천 점수, 주요 근거 3개</zone>
        <zone name="비교 차트">국가별 시장성, 규제부담, 결제위험, 인증난이도, 전략물자주의 점수</zone>
        <zone name="국가 비교 표">국가명, 시장 신호, 인증 필요, 수입규제, 결제위험, 종합 점수</zone>
        <zone name="뉴스 근거">국가별 관련 해외시장뉴스 목록. 제목, 국가, 게시일, 원문 링크</zone>
      </structure>
      <scoreRule>
        <formula>종합점수 = 시장성 30 + 인증용이성 20 + 규제위험 20 + 결제안정성 20 + 제품안전/통제주의 10</formula>
      </scoreRule>
      <scoreLabels>
        <range min="80" max="100" label="우선 검토" color="Success"/>
        <range min="60" max="79" label="검토 가능" color="Info"/>
        <range min="40" max="59" label="주의 필요" color="Warning"/>
        <range min="0" max="39" label="고위험" color="Danger"/>
        <range value="데이터 부족" label="확실한 정보 없음" color="Neutral"/>
      </scoreLabels>
    </screen>

    <screen id="countryRiskDetail" section="3.5">
      <name>국가별 상세 리스크</name>
      <path>/projects/{projectId}/countries/{countryCode}</path>
      <purpose>특정 국가의 인증, 수입규제, 결제위험을 상세 확인</purpose>
      <apis>
        <api>KOTRA_해외인증정보</api>
        <api>KOTRA_수입규제품목 정보</api>
        <api>한국무역보험공사_국별신용등급</api>
        <api>한국무역보험공사_국가별 업종별 위험지수</api>
        <api>한국무역보험공사_수출결제정보</api>
      </apis>
      <structure>
        <zone name="국가 헤더">국가명, 추천 순위, 종합 점수, 마지막 조회일</zone>
        <zone name="인증 패널">인증명, 적용 품목, 필요서류, 절차, 유효기간, 원문 링크</zone>
        <zone name="수입규제 패널">HS 코드, 규제유형, 규제내용, 시행일, 근거 링크</zone>
        <zone name="국가·업종 리스크">신용등급, 업종 위험지수, 위험도 라벨</zone>
        <zone name="결제 리스크">평균 결제기간, 연체율, 권장 결제조건, 주의 메시지</zone>
        <zone name="다음 실행 과제">인증 확인, 규제 원문 검토, 무역보험 상담, 기관 확인 체크리스트</zone>
      </structure>
      <displayConditions>
        <condition>인증정보가 없으면 확실한 정보 없음으로 표시하고 빈 값을 추정하지 않는다.</condition>
        <condition>수입규제 정보가 없으면 조회된 규제 없음과 데이터 기준일을 함께 표시한다.</condition>
        <condition>K-SURE 정보는 개별 바이어 판단이 아니라 국가·업종 단위 참고자료로 표시한다.</condition>
      </displayConditions>
    </screen>

    <screen id="safetyAndControlReview" section="3.6">
      <name>전략물자·제품안전 검토</name>
      <path>/projects/{projectId}/safety</path>
      <purpose>전략물자 가능성과 제품안전·리콜 유사사례 확인</purpose>
      <apis>
        <api>무역안보관리원_HSK 연계표 정보</api>
        <api>국가기술표준원/SafetyKorea_제품 안전인증 및 리콜 정보</api>
      </apis>
      <structure>
        <zone name="전략물자 플래그">HSK 코드, 연계 품목, 통제번호, 검토 결과</zone>
        <zone name="제품안전 검색 결과">제품명·모델명 기준 인증/리콜 유사사례 목록</zone>
        <zone name="리스크 안내">자동 판정 아님, 기관 확인 필요 문구</zone>
        <zone name="조치 체크리스트">전략물자 자가판정, 인증번호 확인, 리콜 유사사례 원문 확인</zone>
      </structure>
      <strategicItemStates>
        <state code="clear" label="현재 입력 코드 기준 연계 항목 없음" treatment="Neutral"/>
        <state code="review_required" label="전략물자 검토 필요" treatment="Warning"/>
        <state code="unknown" label="코드 미확정 또는 데이터 부족" treatment="Neutral"/>
        <state code="error" label="HSK 데이터 조회 실패" treatment="Danger"/>
      </strategicItemStates>
      <productSafetyStates>
        <state code="no_match" label="유사 인증·리콜 사례 없음" treatment="Neutral"/>
        <state code="similar_found" label="유사 사례 확인" treatment="Info"/>
        <state code="recall_found" label="리콜 유사사례 확인" treatment="Danger"/>
        <state code="unknown" label="확실한 정보 없음" treatment="Neutral"/>
      </productSafetyStates>
    </screen>

    <screen id="exportActionReport" section="3.7">
      <name>AI 수출 실행 리포트</name>
      <path>/projects/{projectId}/report</path>
      <purpose>분석 결과를 발표·상담·내부 검토용 1페이지 PDF로 생성</purpose>
      <api>전체 P0 API 결과 사용</api>
      <reportStructure>
        <section order="1" name="기업·제품 요약">회사명, 공장, 업종, 생산품, 제품명, HS/HSK</section>
        <section order="2" name="추천 국가 Top 3">국가명, 종합 점수, 추천 사유</section>
        <section order="3" name="국가별 주의사항">인증, 수입규제, 결제위험 요약</section>
        <section order="4" name="전략물자·제품안전">검토 플래그, 유사 리콜 사례</section>
        <section order="5" name="다음 실행 과제">7일 내 확인할 항목 3~5개</section>
        <section order="6" name="출처">API명, 제공기관, 조회일, 링크</section>
      </reportStructure>
      <pdfSpec>
        <paper>A4 세로</paper>
        <margin>상하좌우 16mm</margin>
        <font>SUIT 또는 Noto Sans KR</font>
        <bodySize>10pt</bodySize>
        <minimumTableTextSize>8.5pt</minimumTableTextSize>
        <pageCount>MVP 기준 1페이지, 상세 리포트는 3페이지 이하</pageCount>
      </pdfSpec>
    </screen>

    <screen id="dataSourcesStatus" section="3.8">
      <name>데이터 출처 및 API 상태</name>
      <path>/data-sources</path>
      <purpose>사용 API 목록, 조회 상태, 라이선스 유의사항 표시</purpose>
      <structure>
        <zone name="API 상태 표">API명, 제공기관, 마지막 성공 조회, 상태, 실패 횟수</zone>
        <zone name="라이선스 안내">원문 재배포 제한 가능성, 링크 중심 사용 원칙</zone>
        <zone name="데이터 기준일">API별 마지막 갱신일 또는 조회일</zone>
      </structure>
    </screen>
  </screenSpecifications>

  <userFlows section="4">
    <title>사용자 흐름</title>
    <flow id="standardAnalysis" section="4.1" name="표준 분석 흐름">
      <step number="1">사용자가 회사명 또는 공장명을 입력한다.</step>
      <step number="2">시스템이 공장등록생산정보를 조회한다.</step>
      <step number="3">사용자가 기업·공장을 선택한다.</step>
      <step number="4">사용자가 제품명, 제품 설명, HS/HSK 후보를 입력한다.</step>
      <step number="5">사용자가 분석 기준 품목을 확정한다.</step>
      <step number="6">시스템이 KOTRA 국가정보와 해외시장뉴스를 조회한다.</step>
      <step number="7">시스템이 추천 수출국 Top 3를 생성한다.</step>
      <step number="8">시스템이 국가별 해외인증과 수입규제를 조회한다.</step>
      <step number="9">시스템이 K-SURE 국가·업종·결제위험을 조회한다.</step>
      <step number="10">시스템이 HSK 연계표와 제품안전·리콜 데이터를 조회한다.</step>
      <step number="11">사용자가 국가별 상세 근거를 확인한다.</step>
      <step number="12">사용자가 PDF 실행 리포트를 생성한다.</step>
    </flow>
    <flow id="factorySearchFailure" section="4.2" name="공장 검색 실패 흐름">
      <step number="1">검색 결과가 없다.</step>
      <step number="2">시스템은 검색 조건 초기화와 수동 입력을 제안한다.</step>
      <step number="3">사용자가 수동 입력을 선택하면 회사명, 지역, 업종, 생산품을 직접 입력한다.</step>
      <step number="4">수동 입력 데이터에는 사용자 입력 배지를 표시한다.</step>
      <step number="5">수동 입력 데이터는 공공데이터 근거 점수에 반영하지 않는다.</step>
    </flow>
    <flow id="partialApiFailure" section="4.3" name="일부 API 실패 흐름">
      <step number="1">국가 추천에 필요한 일부 API가 실패한다.</step>
      <step number="2">성공한 API 결과로 1차 분석을 표시한다.</step>
      <step number="3">실패한 영역에는 조회 실패, 다시 시도, 마지막 성공 데이터 없음을 표시한다.</step>
      <step number="4">종합 점수에는 부분 산출 배지를 표시한다.</step>
      <step number="5">PDF 리포트에는 실패 API와 미확인 항목을 명시한다.</step>
    </flow>
  </userFlows>

  <designSystem section="5">
    <title>디자인 시스템</title>

    <principles section="5.1">
      <principle name="근거 우선">모든 추천·요약 결과 옆에 출처 버튼을 제공한다.</principle>
      <principle name="정보 밀도">데스크톱에서는 표와 비교 차트를 중심으로 구성한다.</principle>
      <principle name="판단 금지">전략물자, 인증, 규제는 최종 판정처럼 보이지 않게 표현한다.</principle>
      <principle name="안정감">B2B 산업 데이터 제품에 맞게 차분한 색상과 명확한 대비를 사용한다.</principle>
      <principle name="빠른 비교">국가별 비교는 동일한 카드 구조와 동일한 축으로 표시한다.</principle>
    </principles>

    <colorPalette section="5.2">
      <token name="--color-bg" hex="#F7F8FA" usage="앱 배경"/>
      <token name="--color-surface" hex="#FFFFFF" usage="카드, 패널"/>
      <token name="--color-surface-alt" hex="#EEF2F5" usage="보조 패널"/>
      <token name="--color-text" hex="#111827" usage="기본 텍스트"/>
      <token name="--color-text-muted" hex="#4B5563" usage="보조 텍스트"/>
      <token name="--color-border" hex="#D5DCE3" usage="기본 테두리"/>
      <token name="--color-primary" hex="#0E6B6F" usage="주요 액션, 선택 상태"/>
      <token name="--color-primary-hover" hex="#09575A" usage="주요 액션 hover"/>
      <token name="--color-accent" hex="#2F80ED" usage="링크, 정보 강조"/>
      <token name="--color-success" hex="#1F7A4D" usage="낮은 위험, 성공"/>
      <token name="--color-warning" hex="#B76E00" usage="검토 필요, 주의"/>
      <token name="--color-danger" hex="#B42318" usage="고위험, 실패"/>
      <token name="--color-neutral" hex="#6B7280" usage="정보 없음, 비활성"/>
      <token name="--color-focus" hex="#1D4ED8" usage="키보드 포커스"/>
      <riskColors>
        <risk level="낮음" background="#E7F6EF" text="#145C37" label="낮음"/>
        <risk level="보통" background="#EAF2FF" text="#1D4ED8" label="보통"/>
        <risk level="높음" background="#FFF4E5" text="#92400E" label="높음"/>
        <risk level="기관 확인 필요" background="#FDECEC" text="#991B1B" label="기관 확인 필요"/>
        <risk level="확실한 정보 없음" background="#F3F4F6" text="#4B5563" label="확실한 정보 없음"/>
      </riskColors>
      <prohibitedUsage>
        <item>보라색/파란색 그라데이션 중심의 장식 배경 금지.</item>
        <item>색상만으로 상태를 전달하지 않는다.</item>
        <item>위험도 표시에서 빨강만 단독으로 쓰지 않고 라벨을 병기한다.</item>
      </prohibitedUsage>
    </colorPalette>

    <typography section="5.3">
      <fontStyle use="H1" font="SUIT, Noto Sans KR, sans-serif" size="32px" lineHeight="1.25" weight="700"/>
      <fontStyle use="H2" font="SUIT, Noto Sans KR, sans-serif" size="24px" lineHeight="1.3" weight="700"/>
      <fontStyle use="H3" font="SUIT, Noto Sans KR, sans-serif" size="20px" lineHeight="1.35" weight="700"/>
      <fontStyle use="본문" font="SUIT, Noto Sans KR, sans-serif" size="16px" lineHeight="1.6" weight="400"/>
      <fontStyle use="보조 텍스트" font="SUIT, Noto Sans KR, sans-serif" size="14px" lineHeight="1.5" weight="400"/>
      <fontStyle use="표/배지" font="SUIT, Noto Sans KR, sans-serif" size="13px" lineHeight="1.4" weight="500"/>
      <fontStyle use="수치 강조" font="IBM Plex Sans KR, SUIT, sans-serif" size="24px" lineHeight="1.2" weight="700"/>
      <rules>
        <rule>본문 최소 글자 크기는 16px.</rule>
        <rule>letter-spacing은 0으로 유지한다.</rule>
        <rule>한 줄 길이는 본문 설명 영역 기준 65~75자 안에서 줄바꿈한다.</rule>
        <rule>버튼 텍스트는 14~16px, 600 weight 사용.</rule>
      </rules>
    </typography>
  </designSystem>

  <layoutRules section="6">
    <title>레이아웃 규칙</title>
    <grid section="6.1">
      <breakpoint range="360~767px">4컬럼, 좌우 16px, 카드 1열</breakpoint>
      <breakpoint range="768~1023px">8컬럼, 좌우 24px, 주요 카드 2열</breakpoint>
      <breakpoint range="1024~1279px">12컬럼, 좌우 32px, 좌측 단계 내비게이션 표시</breakpoint>
      <breakpoint range="1280px 이상">12컬럼, 본문 최대 1440px, 우측 근거 패널 표시</breakpoint>
      <spacingTokens>
        <token name="space-1" value="4px" usage="아이콘과 텍스트 간격"/>
        <token name="space-2" value="8px" usage="작은 요소 간격"/>
        <token name="space-3" value="12px" usage="폼 내부 간격"/>
        <token name="space-4" value="16px" usage="카드 내부 기본 패딩"/>
        <token name="space-6" value="24px" usage="섹션 간격"/>
        <token name="space-8" value="32px" usage="주요 구역 간격"/>
        <token name="space-12" value="48px" usage="화면 상단 여백"/>
      </spacingTokens>
    </grid>
    <cardRules section="6.2">
      <borderRadius>8px</borderRadius>
      <border>1px solid --color-border</border>
      <shadow>기본 없음. 강조 카드만 0 8px 24px rgba(17, 24, 39, 0.08)</shadow>
      <padding>데스크톱 20px, 모바일 16px</padding>
      <nesting>카드 안에 카드를 넣지 않는다. 필요 시 구분선 사용</nesting>
    </cardRules>
    <dataTableRules section="6.3">
      <headerHeight>44px</headerHeight>
      <rowHeight>기본 52px, 밀집 모드 44px</rowHeight>
      <firstColumn>주요 식별값 고정</firstColumn>
      <alignment>수치 우측, 텍스트 좌측, 상태 중앙</alignment>
      <mobileBehavior>표를 카드 리스트로 변환. 원본 표 가로 스크롤 금지</mobileBehavior>
    </dataTableRules>
  </layoutRules>

  <componentSpecifications section="7">
    <title>공통 컴포넌트 규격</title>

    <buttons section="7.1">
      <button type="Primary" height="40px" padding="16px 20px" usage="다음 단계, 리포트 생성, 검색 실행"/>
      <button type="Secondary" height="40px" padding="16px 20px" usage="이전, 보조 액션"/>
      <button type="Ghost" height="36px" padding="12px 16px" usage="출처 보기, 세부 펼치기"/>
      <button type="Danger" height="40px" padding="16px 20px" usage="삭제, 초기화"/>
      <button type="Icon" height="40px x 40px" padding="없음" usage="패널 접기, 새로고침"/>
      <states>
        <state name="default">명확한 배경과 테두리</state>
        <state name="hover">배경 8~12% 어둡게</state>
        <state name="active">1px 아래로 이동 금지. 색상만 변경</state>
        <state name="focus">2px focus ring, offset 2px</state>
        <state name="disabled">opacity 0.45, cursor not-allowed</state>
        <state name="loading">spinner 표시, 클릭 비활성화</state>
      </states>
    </buttons>

    <inputs section="7.2">
      <height>44px</height>
      <borderRadius>6px</borderRadius>
      <border>1px solid --color-border</border>
      <focus>border --color-focus, focus ring 2px</focus>
      <labelRule>항상 표시. placeholder를 label 대체로 쓰지 않음</labelRule>
      <errorRule>입력창 아래 13px 텍스트, danger 색상</errorRule>
      <validationMessages>
        <message condition="필수값 없음">필수 입력값입니다.</message>
        <message condition="2자 미만">2자 이상 입력하세요.</message>
        <message condition="HS 코드 형식 오류">HS/HSK 코드는 숫자 6~10자리로 입력하세요.</message>
        <message condition="API 검색 조건 부족">회사명, 공장명, 생산품명 중 하나 이상 입력하세요.</message>
      </validationMessages>
    </inputs>

    <badges section="7.3">
      <badge type="Status" examples="조회 완료, 부분 산출, 조회 실패" usage="API 상태"/>
      <badge type="Risk" examples="낮음, 보통, 높음, 기관 확인 필요" usage="위험도"/>
      <badge type="Source" examples="KOTRA, K-SURE, KICOX" usage="근거 출처"/>
      <badge type="Manual" examples="사용자 입력" usage="수동 입력 데이터"/>
      <spec height="24px" borderRadius="999px" paddingX="8px" textSize="13px" textWeight="600"/>
    </badges>

    <countryRecommendationCard section="7.4">
      <cardSize>데스크톱 3열, 최소 너비 280px</cardSize>
      <requiredInfo>국가명, 순위, 종합점수, 추천 라벨, 핵심 근거 3개</requiredInfo>
      <actions>상세 보기, 리포트에 포함</actions>
      <riskDisplay>위험도 배지와 텍스트를 함께 표시</riskDisplay>
    </countryRecommendationCard>

    <checklist section="7.5">
      <rowHeight>최소 48px</rowHeight>
      <states>미확인, 확인 필요, 완료, 해당 없음</states>
      <requiredColumns>항목명, 국가, 근거 API, 상태, 원문 링크</requiredColumns>
    </checklist>

    <modal section="7.6">
      <width>기본 560px, 큰 모달 720px</width>
      <mobileBehavior>하단 시트로 전환</mobileBehavior>
      <closeMethods>ESC, 닫기 버튼, 외부 클릭</closeMethods>
      <focusRule>모달 내부에 focus trap 적용</focusRule>
      <usage>삭제 확인, 수동 입력 확인, 리포트 생성 확인</usage>
    </modal>

    <toast section="7.7">
      <position>우상단, 모바일 하단</position>
      <duration>성공 3000ms, 경고 5000ms, 오류 수동 닫기</duration>
      <maxCount>3개</maxCount>
    </toast>
  </componentSpecifications>

  <stateDefinitions section="8">
    <title>상태값 정의</title>
    <apiQueryStates section="8.1">
      <state code="idle" meaning="아직 조회 전" ui="회색 배지"/>
      <state code="loading" meaning="조회 중" ui="skeleton 또는 spinner"/>
      <state code="success" meaning="조회 성공" ui="초록 배지"/>
      <state code="partial_success" meaning="일부 API 실패" ui="주황 배지, 부분 산출 표시"/>
      <state code="empty" meaning="조회 성공, 결과 없음" ui="빈 상태 패널"/>
      <state code="error" meaning="조회 실패" ui="오류 패널"/>
      <state code="stale" meaning="이전 조회 데이터 표시" ui="이전 조회 결과 배지"/>
    </apiQueryStates>
    <analysisStates section="8.2">
      <state code="draft" meaning="기업 또는 제품 정보 미완성"/>
      <state code="ready" meaning="분석 실행 가능"/>
      <state code="analyzing" meaning="API 조회 및 점수 계산 중"/>
      <state code="review_required" meaning="전략물자, 인증, 규제 등 기관 확인 필요"/>
      <state code="complete" meaning="리포트 생성 가능"/>
      <state code="blocked" meaning="필수 데이터 부족으로 진행 불가"/>
    </analysisStates>
    <riskStates section="8.3">
      <state code="low" label="낮음" condition="즉시 중대 위험 없음"/>
      <state code="medium" label="보통" condition="검토 필요 요소 존재"/>
      <state code="high" label="높음" condition="결제·규제·인증 리스크 높음"/>
      <state code="critical" label="기관 확인 필요" condition="전략물자 또는 리콜 유사사례 등 중대 검토 필요"/>
      <state code="unknown" label="확실한 정보 없음" condition="근거 데이터 없음"/>
    </riskStates>
  </stateDefinitions>

  <responsiveRules section="9">
    <title>반응형 기준</title>
    <breakpoint range="360~767px">단일 컬럼, 단계 내비게이션 하단 고정, 표는 카드 리스트로 변환</breakpoint>
    <breakpoint range="768~1023px">2컬럼 카드, 좌측 내비게이션 아이콘형, 근거 패널 하단 시트</breakpoint>
    <breakpoint range="1024~1279px">12컬럼, 좌측 단계 내비게이션 고정, 근거 패널 접힘 기본</breakpoint>
    <breakpoint range="1280px 이상">좌측 내비게이션 + 본문 + 우측 근거 패널 3영역</breakpoint>
    <mobileMinimumSupport>
      <rule>360px 너비에서 텍스트 겹침 금지.</rule>
      <rule>주요 버튼은 화면 하단 고정 액션바에 배치.</rule>
      <rule>국가 추천 카드는 1열.</rule>
      <rule>PDF 미리보기는 썸네일 + 다운로드 버튼만 제공.</rule>
    </mobileMinimumSupport>
  </responsiveRules>

  <accessibilityPrinciples section="10">
    <title>접근성 원칙</title>
    <criterion name="대비">일반 텍스트 4.5:1 이상, 큰 텍스트 3:1 이상</criterion>
    <criterion name="키보드">Tab 순서는 시각 순서와 동일</criterion>
    <criterion name="포커스">모든 인터랙션 요소에 2px 이상 focus ring</criterion>
    <criterion name="터치 영역">최소 44px x 44px</criterion>
    <criterion name="라벨">모든 입력창에 label 필수</criterion>
    <criterion name="색상 의존 금지">위험도는 색상과 텍스트 라벨 병기</criterion>
    <criterion name="스크린리더">아이콘 버튼은 aria-label 필수</criterion>
    <criterion name="애니메이션">prefers-reduced-motion 활성 시 비필수 애니메이션 제거</criterion>
    <criterion name="표 접근성">표에는 caption 또는 aria-label 제공</criterion>
  </accessibilityPrinciples>

  <exceptionHandling section="11">
    <title>예외 처리 기준</title>
    <apiErrors section="11.1">
      <case condition="API 키 없음" message="API 인증 정보가 설정되지 않았습니다." handling="해당 API 결과 비활성화, 관리자 설정 안내"/>
      <case condition="401/403" message="API 접근 권한을 확인해야 합니다." handling="재시도 금지, 설정 확인 유도"/>
      <case condition="429" message="요청 한도를 초과했습니다. 잠시 후 다시 시도하세요." handling="60초 후 재시도 버튼 활성화"/>
      <case condition="500" message="제공기관 API 응답이 불안정합니다." handling="1회 자동 재시도 후 실패 처리"/>
      <case condition="Timeout" message="응답 시간이 초과되었습니다." handling="부분 결과 표시"/>
      <case condition="결과 없음" message="조회된 데이터가 없습니다." handling="빈 상태 표시, 수동 입력 또는 조건 변경 제안"/>
    </apiErrors>
    <dataMismatch section="11.2">
      <case condition="국가명이 API별로 다름" handling="내부 국가코드 매핑 테이블 사용. 매핑 실패 시 사용자 선택"/>
      <case condition="업종 코드가 없음" handling="업종명 텍스트 기반으로 표시하되 점수 계산에는 낮은 신뢰도 적용"/>
      <case condition="HS/HSK 코드 미확정" handling="인증·규제·전략물자 단계 진입 제한"/>
      <case condition="제품안전 유사 검색 과다" handling="상위 10개만 표시하고 유사도 낮음 라벨 제공"/>
      <case condition="KOTRA 뉴스 근거 부족" handling="시장성 점수에서 뉴스 항목 제외, 확실한 정보 없음 표시"/>
    </dataMismatch>
    <aiResponseExceptions section="11.3">
      <case condition="근거 없음" handling="확실한 정보 없음 반환"/>
      <case condition="출처 없는 문장 생성" handling="화면에 표시하지 않음"/>
      <case condition="법적 판정처럼 표현" handling="기관 확인 필요 문구로 대체"/>
      <case condition="상충 데이터 존재" handling="두 출처를 모두 표시하고 출처 간 차이 있음 경고"/>
    </aiResponseExceptions>
  </exceptionHandling>

  <copyGuidelines section="12">
    <title>문구 기준</title>
    <allowedTerms>
      <term>검토 필요</term>
      <term>기관 확인 필요</term>
      <term>확실한 정보 없음</term>
      <term>조회된 데이터 없음</term>
      <term>유사 사례</term>
      <term>참고 정보</term>
      <term>원문 확인</term>
    </allowedTerms>
    <forbiddenTerms>
      <term>수출 가능</term>
      <term>수출 불가</term>
      <term>전략물자 아님</term>
      <term>인증 완료 가능</term>
      <term>안전함</term>
      <term>문제 없음</term>
      <term>법적으로 적합</term>
    </forbiddenTerms>
  </copyGuidelines>

  <developmentSummary section="13">
    <title>개발 기준 요약</title>
    <criterion name="프론트엔드">React 또는 Next.js 기반 웹 앱</criterion>
    <criterion name="UI 컴포넌트">버튼, 입력창, 표, 카드, 배지, 모달, 토스트, 단계 내비게이션, PDF 미리보기</criterion>
    <criterion name="데이터 표시">모든 추천 결과에 출처와 조회일 표시</criterion>
    <criterion name="점수 산정">AI 생성문보다 규칙 기반 점수 우선</criterion>
    <criterion name="AI 역할">요약, 근거 정리, 다음 실행 과제 생성</criterion>
    <criterion name="저장 단위">프로젝트 단위 저장: 기업, 제품, 국가 분석, 리포트</criterion>
    <criterion name="보안">제품 스펙·내부 메모는 비공개 기본값</criterion>
  </developmentSummary>

  <mvpCompletionCriteria section="14">
    <title>MVP 완료 기준</title>
    <criterion name="기업 검색">공장등록생산정보 기반 검색과 선택 가능</criterion>
    <criterion name="제품 입력">제품명, 설명, HS/HSK 후보 입력 가능</criterion>
    <criterion name="국가 추천">Top 3 국가 카드 생성</criterion>
    <criterion name="인증·규제">국가별 인증·수입규제 체크리스트 표시</criterion>
    <criterion name="리스크">국가·업종·결제 위험 표시</criterion>
    <criterion name="안전·통제">전략물자 플래그와 제품안전 유사사례 표시</criterion>
    <criterion name="리포트">1페이지 PDF 미리보기와 다운로드 가능</criterion>
    <criterion name="예외 처리">API 실패, 결과 없음, 데이터 부족 상태 표시</criterion>
    <criterion name="접근성">키보드 탐색, 포커스, 라벨, 대비 기준 충족</criterion>
  </mvpCompletionCriteria>

</projectSpecification>
```
