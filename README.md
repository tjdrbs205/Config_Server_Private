# Config Server

Spring Cloud Config와 호환되는 경량 설정 서버입니다.

## 주요 기능

- **Spring Cloud Config 호환** - Spring Boot 클라이언트와 바로 연동
- **다양한 파일 형식 지원** - YAML, JSON, Properties, ENV
- **Secret 자동 주입** - Phase 연동으로 민감 정보 관리
- **실시간 동기화** - Git 저장소 폴링으로 설정 자동 갱신
- **경량화** - 메모리 내 Git 클론 지원

---

## 빠른 시작

### 1. 설치

```bash
npm install
```

### 2. 환경 변수 설정

```env
GIT_URL=https://github.com/your-org/config-repo.git
GIT_AUTH_TOKEN=ghp_xxxxxxxxxxxx  # Private repo인 경우
```

### 3. 실행

```bash
npm start
```

### 4. 테스트

```bash
curl http://localhost:8000/my-app/dev
```

---

## 환경 변수

### 필수

| 변수      | 설명                              |
| --------- | --------------------------------- |
| `GIT_URL` | 설정 파일이 저장된 Git 저장소 URL |

### 선택 (기본값 제공)

| 변수                | 기본값        | 설명                                  |
| ------------------- | ------------- | ------------------------------------- |
| `PORT`              | `8000`        | 서버 포트                             |
| `SERVER_MODE`       | `development` | `development` / `production` / `test` |
| `GITREPO_MODE`      | `inmemory`    | `inmemory` / `local`                  |
| `GIT_REPO_DIR`      | `./repo`      | Git 저장소 로컬 경로                  |
| `GIT_BRANCH`        | `main`        | 사용할 브랜치                         |
| `GIT_POLL_INTERVAL` | `60000`       | 폴링 주기 (ms)                        |

### 조건부 필수

| 변수             | 조건                | 설명                         |
| ---------------- | ------------------- | ---------------------------- |
| `GIT_AUTH_TOKEN` | Private 저장소      | GitHub Personal Access Token |
| `API_KEY`        | Production 모드     | API 인증 키                  |
| `PHASE_API_KEY`  | Secret 주입 사용 시 | Phase API 키                 |
| `PHASE_APP_ID`   | Secret 주입 사용 시 | Phase 앱 ID                  |
| `PHASE_ENV_NAME` | Secret 주입 사용 시 | Phase 환경 이름              |

---

## API 엔드포인트

### Spring Cloud Config 호환

| 메서드 | 엔드포인트                           | 설명                  |
| ------ | ------------------------------------ | --------------------- |
| GET    | `/config/{app}/{profile}`            | 설정 조회 (JSON)      |
| GET    | `/config/{app}/{profile}/{label}`    | 특정 브랜치 설정 조회 |
| GET    | `/config/{app}-{profile}.yml`        | YAML 형식             |
| GET    | `/config/{app}-{profile}.properties` | Properties 형식       |
| GET    | `/config/{app}-{profile}.json`       | JSON 형식 (중첩 객체) |

### 응답 예시

```json
{
  "name": "my-app",
  "profiles": ["dev"],
  "label": "main",
  "version": "abc123...",
  "state": null,
  "propertySources": [
    {
      "name": "file:https://github.com/repo/my-app-dev.yml",
      "source": {
        "database.host": "localhost",
        "database.port": 5432
      }
    }
  ]
}
```

---

## 설정 파일 구조

Git 저장소에 다음과 같이 설정 파일을 구성합니다:

```
config-repo/
├── application.yml          # 공통 설정
├── application-dev.yml       # 공통 dev 설정
├── application-prod.yml      # 공통 prod 설정
├── my-app.yml               # my-app 기본 설정
├── my-app-dev.yml           # my-app dev 설정
└── my-app-prod.yml          # my-app prod 설정
```

### 설정 우선순위 (높은 순)

1. `{application}-{profile}.yml`
2. `{application}.yml`
3. `application-{profile}.yml`
4. `application.yml`

---

## Secret 자동 주입

설정 파일에서 값이 비어있으면 Phase에서 자동으로 주입합니다.

### 설정 파일 (Git)

```yaml
database:
  host: localhost
  password: # 빈 값
```

### Phase에 저장

```
database.password = "my-secret-password"
```

### API 응답

```json
{
  "database": {
    "host": "localhost",
    "password": "my-secret-password"
  }
}
```

### 매칭 우선순위

1. `database.password` (전체 경로)
2. `DATABASE.PASSWORD` (대문자)
3. `password` (키 이름)
4. `PASSWORD` (키 이름 대문자)

---

## 문서

- [클라이언트 가이드](./docs/CLIENT_GUIDE.md) - Spring Boot, Node.js, cURL 사용법

---

## 라이선스

MIT
