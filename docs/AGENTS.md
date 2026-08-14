# AGENTS.md

## 프로젝트 개요
- **목표**: 초등 바이브 코딩 교육용 AI 퍼실리테이터 프로토타입 구현 (다음 DBR 사이클 평가·성찰 단계 실증 연구에 투입할 실사용 시스템)
- **기반 플랫폼**: entry-offline (entrylabs/entry-offline, Electron + entryjs)
- **핵심 참조 문서**: `docs/AI_퍼실리테이터_구현_워크플로우.md` (전체 phase 계획), `docs/FACILITATOR_SPEC.md` (Table 1 원문 — 아직 없으면 워크플로우 문서의 Table 1 섹션을 참고)

- [x] Phase 0: 코드베이스 탐색 (채팅/블록변경/실행/오류 이벤트 발생 지점 매핑)
- [x] Phase 1: 통합 이벤트 로거 (완료)
- [x] Phase 2: MVP 트리거 — 계획 국면 (모델링 + 스캐폴딩) (완료)
- [x] Phase 3: 파이프라인 검증 (완료)
- [x] Phase 4: 점검 국면 확장 (코칭 + 명료화) (완료)
- [x] Phase 5: 수정 국면 확장 (성찰 + 탐색) (완료)
- [x] Phase 6: 연구용 데이터 계층 + 아동 데이터 윤리 (완료)
- [x] Phase 6-B: facilitator-api /api/logs 실시간 HTTP 업로더 연동 (완료 — HttpDataUploader 구현, 공용 크롬북 대응 매 업로드 시 student_code 동적 조회, events 단일 배치 전송)
- [ ] Phase 7: 교사-AI 협업 인터페이스 (선택)

> 세션 시작 시 이 체크리스트를 먼저 확인하고, 완료된 phase는 체크 표시를 남길 것. 다음 세션에서 이어서 작업할 수 있도록 매 phase 종료 시 이 파일을 업데이트할 것.

## 핵심 규칙
1. Table 1의 트리거·전략·예시 문구를 임의로 재해석하지 말 것 — 원문 그대로 구현하고, 애매하면 코드를 짜기 전에 먼저 질문할 것
2. MVP 순서는 계획(모델링+스캐폴딩) → 점검(코칭+명료화) → 수정(성찰+탐색). 순서를 임의로 바꾸지 말 것
3. 퍼실리테이터 개입 메시지는 AI 코드생성 챗봇과 **시각적으로 구분되는 별도 패널**로 표시할 것 (같은 말풍선에 섞지 말 것 — 학습자가 "이건 안내 메시지"임을 구분할 수 있어야 함)
4. 아동 대상 실사용 시스템이므로 개인식별정보 없이 **세션ID 기반**으로만 로깅. 대화 원문 전체 저장 여부는 별도 확인 없이 임의로 추가하지 말 것
5. 기존 entry-offline의 기능/동작을 깨지 않고 **추가(addition-only)** 방식으로 확장할 것 — 기존 로직을 리팩터링하려면 먼저 이유를 설명할 것
6. 트리거 임계값(30초, 3회, 2회 등)은 하드코딩하지 말고 설정값(config)으로 분리할 것 — 추후 학습자 데이터로 보정 예정

## 금지 사항
- entrylabs/entry-offline, entrylabs/entryjs **원본 저장소에 직접 push 금지** — 반드시 본인 fork에서 작업
- 검증되지 않은 phase를 건너뛰고 다음 phase로 진행 금지 (Phase 3 파이프라인 검증 전에 Phase 4로 넘어가지 말 것)
- 오류 감지 로직 등 확실하지 않은 기술적 가정은 코드로 먼저 확정하지 말고, 코드베이스 확인 결과를 먼저 보고할 것

## 기술 스택
- 언어/프레임워크: Node.js (v22.17.1), Electron (18.3.0), TypeScript, React, Webpack (v4.46.0), entryjs
- 빌드 도구: yarn (v1.22.22), `yarn install --ignore-scripts`로 의존성 설치
- 실행 방법: `yarn webpack:dev` 후 `yarn start`
- 채팅 패널: workspace.tsx 715~725줄 위치에 신규 AIAsidePanel 컴포넌트로 추가
- 블록 변경: Entry.commander.doEvent attach 구독
- 실행 시작: Entry.engine.toggleRun() → fireEvent('start') / dispatchEvent('run')
- 오류 감지: Entry.toast.alert wrap, 문법/변환/런타임 실행 오류 카테고리만 인정
- 오류 판정 기준: message 템플릿 키 단위 비교 (title 아님)
- block_change 판정 기준: insertBlock, destroyBlock, addThreadFromBlockMenu, setFieldValue 등 의미 있는 변경만 포함, moveBlock(단순 위치 이동) 제외
- node_modules 직접 수정 불필요 — 전부 외부 훅으로 수집 가능
