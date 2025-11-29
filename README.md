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

---

## API 사용 방법

### 설정 파일 조회 API

Git repository에 저장된 설정 파일을 조회합니다.

#### 엔드포인트

```
GET /{application}/{profile}
```

#### 파라미터

| 파라미터      | 타입   | 설명                                                           |
| ------------- | ------ | -------------------------------------------------------------- |
| `application` | string | 애플리케이션 이름 (Git repository 내 디렉토리 또는 파일명)     |
| `profile`     | string | 프로파일 이름 (예: `dev`, `prod`, `local` 등 환경별 설정 구분) |

#### 응답 형식

```json
{
  "application": "애플리케이션 이름",
  "profile": "프로파일 이름",
  "propertySources": {
    // 설정 파일 내용 (key-value 형태)
  }
}
```

#### 사용 예시

**요청**

```bash
curl http://localhost:8000/my-app/dev
```

**응답**

```json
{
  "application": "my-app",
  "profile": "dev",
  "propertySources": {
    "database": {
      "host": "localhost",
      "port": 5432,
      "username": "dev_user",
      "password": "secret_from_phase"
    },
    "redis": {
      "host": "localhost",
      "port": 6379
    }
  }
}
```

---

## Secret 자동 주입 기능

설정 파일에서 값이 비어있거나 특정 키에 대한 값이 필요한 경우, Phase 외부 저장소에서 자동으로 값을 가져와 채워줍니다.

### 동작 방식

1. Git repository의 설정 파일을 읽어옵니다.
2. Phase에 저장된 Secret 값들을 조회합니다.
3. 설정 파일의 키와 일치하는 Secret이 있으면 자동으로 값을 주입합니다.

### Secret 매칭 우선순위

1. 전체 경로 (예: `database.password`)
2. 전체 경로 대문자 (예: `DATABASE.PASSWORD`)
3. 키 이름 (예: `password`)
4. 키 이름 대문자 (예: `PASSWORD`)

### 예시

**Git 설정 파일 (원본)**

```yaml
database:
  host: localhost
  password: # 값이 비어있음
```

**Phase에 저장된 Secret**

```
database.password = "my-secret-password"
```

**API 응답 결과**

```json
{
  "database": {
    "host": "localhost",
    "password": "my-secret-password"
  }
}
```
