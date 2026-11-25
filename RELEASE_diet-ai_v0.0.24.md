# diet-ai v0.0.24: 나눠 온 AI 답 모두 읽기

v0.0.23을 바탕으로 AI 답을 읽는 부분만 고쳤습니다. 모델은 그대로입니다(기본 gemini-3.5-flash-lite, 대체 3.1-flash-lite).

## 왜 바꿨나

- v0.0.23 배포 뒤 시험해 보니 코치 한마디가 세 번 중 두 번 "회사에서"처럼 앞부분만 왔습니다.
- 3.5 모델은 답을 여러 조각(parts)으로 나눠 보낼 수 있는데, 서버는 첫 조각만 읽고 있었습니다.
- 이 읽기 코드는 **모든 AI 기능이 함께 씁니다**. 그래서 기록 분석처럼 JSON으로 받는 답이 쪼개져 오면 형식 오류가 날 수 있었습니다.

## 바뀐 점

- 답의 글 조각을 **모두 순서대로 이어서** 읽습니다. 모델이 생각한 과정을 담은 조각(thought)은 뺍니다.
- 남은 글이 없으면 "AI 응답이 비어있습니다" 오류를 냅니다.
- 원인 확인용 로그를 남깁니다. 끝난 이유가 정상(STOP)이 아니거나 조각이 여러 개면 끝난 이유·조각 수·글자 수만 남기고, 내용은 남기지 않습니다.

## 검증

- `tests/answer-parts-v0.0.24.cjs`: 4개 통과
  - 글 조각 잇기와 생각 조각 빼기
  - 쪼개진 JSON 읽기
  - 정상일 때 로그 없음, 이상한 끝남은 로그
  - 빈 답은 오류
- v0.0.24에서 기존 검사도 통과: `model-fallback-v0.0.23`(8), `workout-coach-v0.0.22`(5), `exercise-details-v0.0.21`(9)

## 배포

- 배포용 파일: `.claude/deploy/supabase/functions/diet-ai/index.ts`(= `diet-ai_v0.0.24.ts`)
- 명령(직접 실행):
  ```
  npx.cmd supabase functions deploy diet-ai --project-ref nppkwxwzbyhfwsmdudge --use-api --workdir .claude/deploy
  ```
