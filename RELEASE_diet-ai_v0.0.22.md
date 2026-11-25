# diet-ai v0.0.22: 운동 코치(workoutCoach)

화면 v0.5.6의 한 줄 입력과 코치 한마디를 위한 서버입니다. 새 동작 하나만 추가했고, 기존 동작은 그대로라 운영 화면(v0.4.6)과 이전 시험판에 영향이 없습니다. DB 변경도 없습니다.

## 바뀐 점

- 새 동작 `workoutCoach`
  - `mode: "parse"`: 한 줄 입력(최대 100자)을 정해진 값으로만 바꿉니다.
    - 반환: `{ parsed: { minutes, condition, groups, avoid, place } }`
    - 시간은 20~120분(10분 단위), 컨디션은 tired/normal/good, 부위는 7개 그룹, 장소는 company/apartment입니다.
    - 그 밖의 값은 버립니다. 뺄 부위(avoid)와 겹치는 부위는 groups에서 뺍니다.
  - `mode: "comment"`: 화면 규칙이 이미 만든 계획을 2~3문장으로 풀어 줍니다.
    - 반환: `{ comment }`(최대 300자, 마크다운 기호와 줄바꿈 제거)
    - 계획에 없는 종목·무게·횟수 제안, 진단·치료 조언, 칼로리·감량 수치를 금지합니다.
    - 아픈 부위가 있으면 "무리하지 말고 계속되면 전문가와 상담" 한 문장만 씁니다.
- 프롬프트에는 화면이 보낸 계획 요약만 넣습니다. 서버가 붙이는 회원 정보(질환, 나이 등)와 이름은 넣지 않습니다. 결과는 저장하지 않습니다.
- 모델은 기존처럼 gemini-3.1-flash-lite이고, 일시 오류면 2.5-flash-lite로 넘어갑니다.

## 검증

- `tests/workout-coach-v0.0.22.cjs`: 5개 통과
  - 허용 값만 통과
  - parse: JSON 요청 한 번, 100자 자르기, 빈 문장 거절
  - comment: 계획만 풀어 주는 지시, 개인정보 없음, 결과 다듬기·300자 제한
  - 빈 응답·모르는 mode 실패, 동작 연결
- `tests/exercise-details-v0.0.21.cjs`를 v0.0.22에 실행해 9개 통과(기존 동작 그대로)

## 배포

1. 배포용 파일: `.claude/deploy/supabase/functions/diet-ai/index.ts`(= `diet-ai_v0.0.22.ts`)
2. 명령(직접 실행):
   ```
   npx.cmd supabase functions deploy diet-ai --project-ref nppkwxwzbyhfwsmdudge --use-api --workdir .claude/deploy
   ```
3. 되돌리기: 같은 위치에 `diet-ai_v0.0.21.ts`를 복사해 다시 배포합니다.
