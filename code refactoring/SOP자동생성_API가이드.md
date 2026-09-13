# UNI RAG System API — 사내 개발 환경 사용법

> SOP 자동생성을 포함한 RAG 호출 방법. **사내 개발 환경 기준.**
> 🔴 이 문서에 비밀번호·토큰 값을 적지 않는다.

---

## 1. 접속 주소

```
http://10.20.10.101:8000
```

| | |
|:--|:--|
| 전체 API 목록 | `http://10.20.10.101:8000/openapi.json` |
| 성격 | SOP 전용이 아니라 **범용 RAG 시스템**이다. `/chat/json` 은 그중 한 엔드포인트 |

🔺 **공인 주소(`221.147.100.171:8000`)는 사내에서 안 붙는다.** 그쪽 포워딩에 출발지 IP
화이트리스트가 걸려 있어 특정 서버에서만 허용된다. 사내에서는 위 내부 IP 를 쓴다.

---

## 2. 계정과 인증

### 어떤 계정을 쓰나

이 시스템은 자체 사용자 DB 가 없고 **사내 HR(`hr.unes.kr`)에 물어본다.**
그래서 **직원 개인 계정으로 그대로 로그인된다.** 별도 발급 절차가 없다.

| 용도 | 계정 |
|:--|:--|
| 개발·시험 | 🟢 **본인 사내 계정** |
| 서비스 상시 운영 | 서비스 계정을 따로 신청한다 — 개인 계정에 매달면 담당자 변동 시 끊긴다 |

### 토큰 발급

```http
POST /auth/login
Content-Type: application/json

{ "account": "<사내 계정>", "password": "<비밀번호>" }
```

**응답**

```json
{ "token": "eyJhbGciOi..." }
```

| | |
|:--|:--|
| 응답 필드 이름 | `token` — `access_token` 이 아니다 |
| 유효 기간 | **30일** |
| 갱신 | 만료 전 재로그인. `401` 을 받으면 재발급하면 된다 |

🔴 **2026-08-18 부터 인증이 필수다.** 그 전에는 무인증이었으므로, 예전 코드를 참고하면
`Authorization` 이 없어 401 이 난다.

---

## 3. 요청

### 공통 헤더

| 헤더 | 값 | 필수 |
|:--|:--|:--:|
| `Authorization` | `Bearer <token>` | 🔴 필수 |
| `Content-Type` | `application/json` | 필수 |
| `Accept` | `text/event-stream` | **`/chat/json` 에 필수** — 응답이 스트림이다 |

### SOP 생성 — `POST /chat/json`

```http
POST /chat/json
Authorization: Bearer <token>
Accept: text/event-stream
Content-Type: application/json

{
  "query":     "질산 누출 시 대응 절차",
  "model_key": "<4절 참조>",
  "top_k":     5
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|:--|:--|:--:|:--|
| `query` | string | 🔴 **필수** | 질의문 |
| `model_key` | string \| null | 선택 | 쓸 모델. **4절을 반드시 읽는다** |
| `top_k` | int | 선택 | 검색해 올 문서 수. 기본 5 |

---

## 4. 🔴 모델 지정 — 가장 자주 사고가 나는 곳

### 규칙

**모델명을 코드나 설정에 고정하지 않는다. 매 요청 조회해서 고른다.**

### 왜

2026-08-18 이후 상류 LLM 이 **예고 없이 교체됐다.**

```
Qwen3.6-35B-A3B   →   Qwen3.8-27B
```

옛 이름을 보내던 호출은 전부 **404** 로 죽었다. 설정 파일에 모델명을 박아둔 쪽은
서비스가 멈춘 뒤에야 알았고, 원인이 "주소 문제"로 오인돼 시간이 더 걸렸다.
**모델은 앞으로도 바뀐다.**

### 어떻게

#### ① 쓸 수 있는 모델 조회

```http
GET /models/
Authorization: Bearer <token>
```

**응답**

```json
{
  "models": [
    { "key": "qwen3.8-27b", "available": true,  "...": "..." },
    { "key": "...",          "available": false, "...": "..." }
  ]
}
```

#### ② `available: true` 인 것 중에서 고른다

| 상황 | 어떻게 |
|:--|:--|
| 특정 계열을 선호 | `key` 에 그 문자열이 포함된 것 우선 (예: `qwen`) |
| 선호 항목이 없음 | `available` 인 것 중 첫 번째 |
| `available` 이 하나도 없음 | 🔴 상류 이상. 호출을 보내지 말고 오류 처리 |

#### ③ 고른 `key` 를 `model_key` 로 보낸다

```json
{ "query": "...", "model_key": "qwen3.8-27b" }
```

### `model_key` 를 비우면

`null` 을 보내거나 생략하면 상류 기본값을 탄다. **권장하지 않는다** — 기본값이 무엇인지
호출하는 쪽에서 알 수 없고, 바뀌어도 모른다.

### 비상용 탈출구

상류가 이상할 때만, 설정으로 특정 `model_key` 를 **강제**할 수 있게 만들어 두면 좋다.
평소에는 비워두고 자동 선택을 쓰고, 문제가 생겼을 때만 값을 넣는 식이다.

---

## 5. 응답 — SSE 스트림

### 파싱 규칙

| # | 규칙 |
|:--|:--|
| 1 | `data:` 로 시작하는 줄만 처리한다 |
| 2 | `data: ` 뒤의 **공백 1개**를 떼어낸다 |
| 3 | 페이로드가 `[DONE]` 이면 스트림을 끊는다 |
| 4 | 나머지는 JSON 이다 |

### 이벤트

| 페이로드 | 내용 |
|:--|:--|
| `{"__status__":"searching\|reranking\|generating"}` | 진행 단계 |
| `{"__thinking__":"…"}` | LLM 추론 과정 (thinking 계열 모델만 나옴) |
| `{"__compn__":{…}}` | **SOP 조각 1개 완성** — 화면에 그리는 알맹이. 여러 번 온다 |
| `{"__sources__":[{filename,…}]}` | RAG 출처. 마지막에 1회 — ⚠️ 7절 |
| `{"__done__":{filename,count}}` | 생성 완료 |
| `{"__error__":"…"}` | 오류 |
| `[DONE]` | 종료 표시 |

동작 흐름은 **벡터검색 → 리랭킹 → 컨텍스트 조립 → LLM 스트리밍** 이고,
`compns` 요소가 하나 완성될 때마다 `__compn__` 이 즉시 발사된다.

---

## 6. 예제

### curl

```bash
read -p 'account: '  ACCOUNT
read -s -p 'password: ' PW; echo

RAG=http://10.20.10.101:8000

# ① 토큰
TOKEN=$(curl -s -X POST $RAG/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"$ACCOUNT\",\"password\":\"$PW\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# ② 쓸 수 있는 모델
MODEL=$(curl -s $RAG/models/ -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json; ms=[m for m in json.load(sys.stdin)["models"] if m.get("available")]; print(ms[0]["key"])')
echo "model: $MODEL"

# ③ 생성 (스트림)
curl -N -X POST $RAG/chat/json \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: text/event-stream' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\"질산 누출 시 대응 절차\",\"model_key\":\"$MODEL\"}"
```

### Python

```python
import httpx, json

RAG = "http://10.20.10.101:8000"
PREFER = "qwen"          # 선호 계열. 없으면 available 첫 번째

# 🔺 타임아웃을 넉넉히. LLM 첫 글자까지 시간이 걸려 기본값(5초 안팎)이면 끊긴다
with httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0)) as c:

    token = c.post(f"{RAG}/auth/login",
                   json={"account": ACCOUNT, "password": PASSWORD}).json()["token"]
    auth = {"Authorization": f"Bearer {token}"}

    # 모델 선택 — 매 요청 조회한다 (4절)
    models = [m for m in c.get(f"{RAG}/models/", headers=auth).json()["models"]
              if m.get("available") and m.get("key")]
    if not models:
        raise RuntimeError("available 한 모델이 없습니다")
    preferred = [m for m in models if PREFER in m["key"].lower()]
    model_key = (preferred or models)[0]["key"]

    with c.stream("POST", f"{RAG}/chat/json",
                  headers={**auth, "Accept": "text/event-stream"},
                  json={"query": QUERY, "model_key": model_key}) as r:
        if r.status_code != 200:
            r.read()
            raise RuntimeError(f"{r.status_code}: {r.text}")
        for line in r.iter_lines():
            if not line.startswith("data:"):
                continue
            payload = line[5:].lstrip()
            if payload == "[DONE]":
                break
            event = json.loads(payload)
            # ⚠️ __sources__ 는 7절을 보고 처리 방침을 정한다
            print(event)
```

---

## 7. ⚠️ 알고 있어야 할 것

### `__sources__` 에 사내 문서가 실린다

색인 대상이 **사내 NAS 문서**라, 이 이벤트에 **파일명과 본문 200자 발췌**가 담긴다.

| 어디에 표시하나 | 판단 |
|:--|:--|
| 내부 개발자·직원 화면 | 문제없다 |
| **외부·고객사가 보는 화면** | 🔴 **걸러내야 한다** |

### 검색에 고객사 필터가 없다

`/chat/json` 은 고객사 조건을 넘기지 않는다. 다만 색인 대상이 사내 문서뿐이라
고객사 간 데이터 교차는 성립하지 않는다. **위험은 위 항목(밖으로 나가는 것) 쪽이다.**

### 상류는 우리 통제 밖이다

2026-08-18 에 인증이 추가됐고, 08-28 에 모델이 교체됐다. **계약이 또 바뀔 수 있다.**
호출부를 한 곳에 모아두면 바뀔 때 그 파일만 고치면 된다.

---

## 8. 오류

| 증상 | 원인 | 대처 |
|:--|:--|:--|
| 연결 자체가 안 됨 | 공인 주소를 사내에서 썼다 | 내부 IP 로 (1절) |
| `401` | 토큰 없음·만료 | 재로그인 |
| `404` | 모델명을 고정해 뒀는데 교체됐다 | 4절 |
| `500` | 상류 오류. 모델 부재도 여기로 나올 수 있다 | `/models/` 확인 |
| 첫 응답 전에 끊김 | 타임아웃이 짧다 | 60초 안팎으로 |
| 응답은 오는데 화면이 빔 | `data:` 파싱 규칙 | 5절 — 공백 1개 트림, `[DONE]` 종료 |

문의처 — 상류 시스템 자체는 `unecorp/svc-uni` 담당.
고객사 격리·출처 필터가 필요하면 PAIS 팀에 문의.
