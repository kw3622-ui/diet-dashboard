# RPG 저장 구조 추가 전 상태

- 확인일: 2026-10-08
- `profiles`: 3행, RLS 사용
- `logs`: 447행, RLS 사용
- `daily_reports`: 94행, RLS 사용
- `period_reports`: 16행, RLS 사용
- `diet-ai`: ACTIVE, v13, JWT 검증 사용

v0.3.0 마이그레이션은 위 테이블을 변경하지 않고 RPG 전용 테이블 네 개만 추가합니다.

