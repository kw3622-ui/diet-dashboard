# diet-ai v0.0.23: Gemini 모델 교체

v0.0.22를 바탕으로 모델 설정만 바꿨습니다. 다른 코드와 DB는 그대로입니다.

## 왜 바꿨나

- 2026-11-26, v0.0.22 배포 직후 AI 호출이 모두 실패했습니다. 함수 로그를 보면 다음과 같습니다.
  - 기본 모델 `gemini-3.1-flash-lite`가 몇 분 동안 계속 **503(바쁨)**을 냈습니다.
  - 대체 모델 `gemini-2.5-flash-lite`는 **404**("no longer available to new users")로 서비스가 끝나 있었습니다.
- 그래서 기본 모델이 바쁠 때 **기존 AI 기능 전부**(기록 분석, 총평, 운동 코치 등)가 실패할 수 있었습니다. v0.0.22 변경과는 상관없는, 예전부터 있던 설정 문제입니다.

## 바뀐 점

- 기본 모델 **`gemini-3.5-flash-lite`**, 대체 모델 **`gemini-3.1-flash-lite`**(사용자 결정: A안)
  - 둘 다 Gemini API 무료 등급에서 무료입니다(Google 요금 페이지 기준). 무료 등급은 Google이 가용성을 보장하지 않습니다.
- 기본 모델이 **404(모델 없음)**를 내도 대체 모델로 한 번 넘어갑니다. 모델 하나가 사라져도 모든 AI 기능이 멈추지 않게 하기 위해서입니다. 404는 다시 시도하지 않고 바로 넘어갑니다.

## 검증

- `tests/model-fallback-v0.0.23.cjs`: 8개 통과
  - 평소에는 3.5만 사용
  - 한 번 바쁘면 같은 모델로 재시도
  - 두 번 바쁘면 3.1로 넘어가고 로그를 남김
  - 할당량·게이트웨이 오류도 넘어감
  - 둘 다 실패하면 오류를 알림
  - 404는 바로 3.1로
  - 400은 넘어가지 않음
  - 모델 이름은 한 곳에만 정의
- `tests/workout-coach-v0.0.22.cjs`(5)와 `tests/exercise-details-v0.0.21.cjs`(9)를 v0.0.23에 실행해 모두 통과했습니다.
- 배포 후 실제 확인: 운동 코치 parse·comment와 기존 기능(기록 분석 1건)

## 배포

1. 배포용 파일: `.claude/deploy/supabase/functions/diet-ai/index.ts`(= `diet-ai_v0.0.23.ts`)
2. 명령(직접 실행):
   ```
   npx.cmd supabase functions deploy diet-ai --project-ref nppkwxwzbyhfwsmdudge --use-api --workdir .claude/deploy
   ```
3. 되돌리기: `diet-ai_v0.0.22.ts`를 같은 위치에 복사해 다시 배포합니다. 다만 v0.0.22는 위 문제를 그대로 가지고 있습니다.
