# diet-dashboard 작업 규칙 (모든 PC 공통)

진행 상황과 앞으로의 일정은 `PROGRESS.md`, 운동 코치 설계는 `WORKOUT_COACH_PLAN.md`를 먼저 읽는다.

## 대화

- 사용자와는 **한국어**로 이야기한다. 질문, 선택지 버튼, 요약도 한국어로 쓴다.
- 메시지에 `%%` 또는 `(구현아님)`이 있으면 코드나 파일을 고치지 않는다. 검토 의견, 가능 여부, 설계안을 먼저 보여주고 확인을 기다린다.
- 정할 것이 있으면 권장안을 함께 제시한다. 사용자는 보통 "권장안대로"라고 답한다.

## 구조

- GitHub Pages(`main` 브랜치 루트)로 서비스하는 React-in-HTML PWA다. 빌드 단계는 없다.
- **운영 화면** `index.html`, **시험판** `index_vX.Y.Z.html`
  - 새 기능은 이전 시험판을 복사해 새 버전 파일에서 만든다. 시험이 끝나면 운영 `index.html`을 교체한다.
  - 운영을 교체할 때는 교체 전 운영 파일을 `index_rollback_pre_vX.Y.Z.html`로 남긴다.
- 브랜치는 쓰지 않는다. `main`에서 바로 작업한다.
- 백엔드는 Supabase(project `nppkwxwzbyhfwsmdudge`)다.
  - 표: `logs`, `profiles`, `routines`, `routine_checks`, `intake_items`, `intake_checks`, `daily_reports` 등이고, 모두 RLS로 본인 행만 다룬다.
  - Edge Function은 `diet-ai` 하나다(Gemini 호출).
- 서버 코드는 `diet-ai_vX.Y.Z.ts` 버전 파일로 둔다.
  - 배포용 파일은 `.claude/deploy/supabase/functions/diet-ai/index.ts`다. `.claude/`는 git에 올리지 않으므로 PC마다 새로 만든다.
- DB 변경은 `이름_vX.Y.Z.sql`과 `이름_vX.Y.Z_rollback.sql`을 함께 만든다.
- 버전마다 `RELEASE_vX.Y.Z.md`(화면)와 `RELEASE_diet-ai_vX.Y.Z.md`(서버)에 바뀐 점, 검증, 되돌리기를 적는다.
- 종목 사전은 `exercise_library_v1.json`(168종목)이다. 그림은 free-exercise-db를 jsDelivr로 쓴다.

## 하기 전에 확인받을 것

- **서버 배포**: 사용자가 직접 명령을 실행한다. 배포한 뒤에는 `get_edge_function`으로 올라간 코드가 버전 파일과 같은지 확인한다.
  ```
  npx.cmd supabase functions deploy diet-ai --project-ref nppkwxwzbyhfwsmdudge --use-api --workdir .claude/deploy
  ```
- **DB 변경**, **예전 기록 일괄 처리**, **운영 index.html 교체**
- 시험하려고 실제 계정에 저장한 값은 확인한 뒤 지우거나 되돌리고, 그 사실을 알린다. 사용자가 직접 만든 데이터(장소 목록 등)는 건드리지 않는다.

## 검사

- Node 테스트는 `tests/*.cjs`다. 페이지나 서버의 일부를 `vm`으로 실행해 확인한다.
  - 예: `node tests/workout-talk-v0.5.6.cjs` (인자를 주면 다른 파일에도 실행: `node tests/x.cjs index.html`)
- 페이지 앞부분의 도우미 함수 구역(`const formatExerciseSet` ~ `// ★ v0.3.8 항목별 근거`)에는 **JSX를 넣지 않는다**. 예전 검사들이 이 구역을 그대로 실행하기 때문이다. 화면 부품은 그 밖에 둔다.
- React 훅(`useMemo` 등)은 화면 단계별 `if` 분기 안에 두지 않는다.
- 작업 사본은 `core.autocrlf=true`라서 CRLF일 수 있다. 예전 검사 중 일부는 LF 사본이 필요하다(`tr -d '\r'`).
- 로컬 확인: `node tools/serve.cjs` → `http://localhost:8765/index_vX.Y.Z.html` (실제 계정으로 로그인)
- 알려진 기존 실패: `exercise-details-ui-v0.5.0`의 1줄(v0.5.1부터 카드 함수가 바뀜). `routines-v0.4.3`은 메뉴가 5칸이 되어 몇 줄을 맞춰야 통과한다.

## 커밋

- 사용자가 "커밋하고 push"라고 하면 한다.
  ```
  git -c user.name="kw3622-ui" -c user.email="243304182+kw3622-ui@users.noreply.github.com" commit
  ```
- 메시지는 한국어 요약이고, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙인다.

## 원칙

- 칼로리는 다루지 않는다(앱 전체에 없음, 운동 칼로리는 부정확하고 오해를 부름).
- AI(Gemini 무료 등급)는 아껴 쓴다. 규칙으로 되는 것은 규칙으로 하고, AI는 꼭 필요한 때만 한 번 부른다.
  - AI가 실패해도 기능은 그대로 쓸 수 있어야 한다.
  - 이름·계정·질환 정보는 꼭 필요한 기능 외에는 보내지 않는다.
- 의학적 진단이나 치료 조언은 하지 않는다.
