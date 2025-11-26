# Config Server - 환경 변수 설정

## 환경 변수 목록

```env
PORT=
SERVER_MODE=
GITREPO_MODE=
GIT_AUTH_TOKEN=
GIT_URL=
GIT_BRANCH=
PHASE_API_KEY=
PHASE_APP_ID=
PHASE_ENV_NAME=
```

---

## 필수 환경 변수

| 변수      | 설명                      |
| --------- | ------------------------- |
| `GIT_URL` | Git repository URL (필수) |

> **주의**: `GIT_URL`이 없으면 애플리케이션이 실행되지 않습니다.

---

## 기본값 (Default)

| 변수           | 기본값        | 설명                                            |
| -------------- | ------------- | ----------------------------------------------- |
| `PORT`         | `8000`        | 서버 포트 번호                                  |
| `SERVER_MODE`  | `development` | 서버 모드 (`development`, `production`, `test`) |
| `GITREPO_MODE` | `inmemory`    | Git repository 모드 (`inmemory`, `local`)       |
| `GIT_BRANCH`   | `main`        | 사용할 Git branch                               |

---

## 조건부 필수 환경 변수

### Private Repository 접근 시

| 변수             | 설명                         |
| ---------------- | ---------------------------- |
| `GIT_AUTH_TOKEN` | GitHub Personal Access Token |

### 외부 Secret 저장소 사용 시

| 변수             | 설명                          | 지원 서비스               |
| ---------------- | ----------------------------- | ------------------------- |
| `PHASE_API_KEY`  | Phase API 인증 키 (필수)      | Phase (현재 Phase만 지원) |
| `PHASE_APP_ID`   | Phase Application ID (필수)   | Phase                     |
| `PHASE_ENV_NAME` | Phase Environment 이름 (필수) | Phase                     |

> **Secret 관리 기능**: Git repository의 설정 파일에서 key만 있고 value가 비어있는 경우, Phase와 같은 외부 저장소에서 실제 값을 가져와 자동으로 채워줍니다.

---

## 사용 예시

```env
# .env 파일 예시
PORT=3000
SERVER_MODE=production
GITREPO_MODE=local
GIT_URL=https://github.com/username/repo.git
GIT_AUTH_TOKEN=ghp_xxxxxxxxxxxx
GIT_BRANCH=main
PHASE_API_KEY=your_phase_api_key
PHASE_APP_ID=your_phase_app_id
PHASE_ENV_NAME=Development
```
