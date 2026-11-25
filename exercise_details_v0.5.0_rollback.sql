-- v0.5.0 되돌리기: 백업해 둔 운동 기록 exercise_meta를 되돌리고 백업 테이블을 지운다.
-- 백업 뒤에 새로 만든 운동 기록은 백업에 없으므로 그대로 남는다(version 2 값은 예전 화면에서도 무시되어 문제없음).
-- 서버도 되돌리려면 diet-ai_v0.0.20.ts를 다시 배포한다.

update public.logs l
set exercise_meta = b.exercise_meta
from public.exercise_meta_backup_v050 b
where l.id = b.log_id;

drop table if exists public.exercise_meta_backup_v050;
