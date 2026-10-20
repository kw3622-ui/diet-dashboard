# diet-dashboard 보안 대책 v0.3.2

## 즉시 적용

- `anon`의 애플리케이션 테이블 권한을 모두 제거합니다. 회원가입 프로필은 `auth.users` 트리거가 생성하므로 브라우저의 익명 테이블 접근은 필요하지 않습니다.
- 로그인 사용자에게도 `TRUNCATE`, `TRIGGER`, `REFERENCES` 권한을 주지 않고 실제 화면에서 사용하는 CRUD만 허용합니다.
- `is_admin()`과 `admin_user_activity_stats()`의 기본 `PUBLIC` 및 `anon` 실행 권한을 제거합니다.
- 두 관리자 함수는 로그인 사용자에게만 실행을 허용하고 함수 내부에서 `auth.uid()`와 관리자 여부를 다시 확인합니다.
- 프로필 보호 트리거로 `id`, `created_at`, `is_admin` 변경과 본인의 `is_approved` 변경을 차단합니다.
- 사용자가 본인 프로필을 직접 삽입하는 예외 상황에서도 `is_admin=false`, `is_approved=false`만 허용합니다.
- 기존 RLS 정책의 역할을 `authenticated`로 제한하고 UPDATE 정책에 누락된 `WITH CHECK`를 추가합니다.

## 기능 검증

- 일반 사용자: 본인 프로필 조회·수정, 기록 CRUD, 목표 CRUD가 계속 동작해야 합니다.
- 관리자: 전체 회원 조회, 회원 승인 변경, 사용 현황 RPC, 계정 삭제가 계속 동작해야 합니다.
- 비로그인 사용자: 공개 테이블과 관리자 RPC를 직접 호출할 수 없어야 합니다.

## 후속 대책

- Supabase Dashboard의 Auth 보안 설정에서 유출 비밀번호 차단 기능을 활성화합니다.
- 장기적으로 `admin_user_activity_stats()`를 Edge Function의 관리자 전용 action으로 옮기고 공개 스키마의 `SECURITY DEFINER` RPC를 제거합니다.
- 배포 후 Security Advisor를 다시 실행하고, 의도적으로 남긴 경고와 새 경고를 분리해 기록합니다.
