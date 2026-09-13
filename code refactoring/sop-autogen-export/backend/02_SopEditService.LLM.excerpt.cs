// ═════════════════════════════════════════════════════════════════════════════
//  [발췌] SOP 자동생성(LLM) — 서비스 계층 (핵심 로직)
//  원본: protectofoundationservice/Services/SOP/Edit/SopEditService.cs
//  발췌 범위: L1~19(using), L129~136(인터페이스 시그니처),
//             L138~162(DI 생성자), L1483~1773(LLM 처리 전체)
// ═════════════════════════════════════════════════════════════════════════════

using LinqKit;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using NpgsqlTypes;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;
using Une.Protecto.FoundationService.Exceptions;
using Une.Protecto.FoundationService.Models;
using Une.Protecto.FoundationService.Models.Details;
using Une.Protecto.FoundationService.Models.Requests;
using Une.Protecto.FoundationService.Models.Responses;
using Une.Protecto.FoundationService.Models.Settings;
using Une.Protecto.FoundationService.Models.Simples;
using Une.Protecto.FoundationService.Services.Hubs;
using Une.Protecto.FoundationService.Utilities;

namespace Une.Protecto.FoundationService.Services.SOP.Edit
{
    public interface ISopEditService
    {
        // ... 중략: 기존 SOP CRUD / FlowChart 시그니처 ...

        /// <summary>
        /// 외부 LLM 서비스에 쿼리를 보내고 응답 헤더 수신 시점에 GroupNm을 발급하여 반환.
        /// 이후 SSE 본문은 백그라운드에서 파싱되어 SignalR(GroupNm) 그룹으로 compn/status 이벤트 푸시.
        /// </summary>
        /// <param name="query">사용자 자연어 쿼리</param>
        /// <param name="cancelToken">동기 단계(헤더 수신까지)의 취소 토큰. 백그라운드 단계는 앱 lifetime 토큰 사용</param>
        /// <returns>Success/GroupNm/ResultMessage를 채운 LLMSopFlowChartResponse</returns>
        Task<LLMSopFlowChartResponse> GetLLMSopFlowChartAsync(string query, CancellationToken cancelToken = default);
    }

    public class SopEditService : ISopEditService
    {
        private readonly ProtectoContext _context;
        private readonly Common.ICommonCodeService _commonCodeService;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IOptions<LLMSopServiceSettings> _llmSopSettings;
        private readonly IBackgroundTaskQueue _taskQueue;
        private readonly IHubPublisherService _hubPublisherService;

        public SopEditService(
            ProtectoContext context,
            Common.ICommonCodeService commonCodeService,
            IHttpClientFactory httpClientFactory,
            IOptions<LLMSopServiceSettings> llmSopSettings,
            IBackgroundTaskQueue taskQueue,
            IHubPublisherService hubMessageBroker)
        {
            _context = context;
            _commonCodeService = commonCodeService;
            _httpClientFactory = httpClientFactory;
            _llmSopSettings = llmSopSettings;
            _taskQueue = taskQueue;
            _hubPublisherService = hubMessageBroker;
        }


        // ────────────────────────────────────────────────────────────────────
        // ... 중략: 기존 SOP CRUD·FlowChart 저장·JSON Import 구현부 ...
        // ────────────────────────────────────────────────────────────────────

        /// 외부 LLM 서비스에 쿼리를 보내고 응답 헤더 수신 시점에 GroupNm을 발급하여 반환.
        /// 이후 SSE 본문은 백그라운드에서 파싱되어 SignalR(GroupNm) 그룹으로 compn/status 이벤트 푸시.
        /// </summary>
        /// <param name="query">사용자 자연어 쿼리</param>
        /// <param name="cancelToken">동기 단계(헤더 수신까지)의 취소 토큰. 백그라운드 단계는 앱 lifetime 토큰 사용</param>
        /// <returns>Success/GroupNm/ResultMessage를 채운 LLMSopFlowChartResponse</returns>
        public async Task<LLMSopFlowChartResponse> GetLLMSopFlowChartAsync(string query, CancellationToken cancelToken = default)
        {
            // 1. 설정 검증 — 자원 할당 전 빠른 실패
            var baseUrl = _llmSopSettings.Value.BaseUrl;
            if (string.IsNullOrEmpty(baseUrl))
                //throw new InvalidOperationException("LLM 서버 URL 설정을 확인해주세요");
                throw new Exception("LLM 서버 URL 설정을 확인해주세요");
            

            // 1. GroupNm 발급 — 매 요청마다 충돌 없는 고유 그룹 보장
            var groupNm = $"{HubPublisherService.GroupName.SOE}-{Guid.NewGuid():N}";

            // 2. HttpClient 준비 — 인스턴스별 Timeout 격리 보장
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = Timeout.InfiniteTimeSpan; // 본문 스트리밍, 헤더 타임아웃은 아래 linked CTS

            // 3. 절대 URL 조립
            var url = _llmSopSettings.Value.BaseUrl.TrimEnd('/') + "/chat/json";

            // 4. 요청 본문 직렬화 및 HttpRequestMessage 구성 — SSE Accept 헤더 포함
            var bodyJson = JsonSerializer.Serialize(new { query });
            var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(bodyJson, Encoding.UTF8, "application/json")
            };
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));

            // 5. 헤더 수신용 linked CTS — 동기 응답 Success 판정 타임아웃
            using var headerCts = CancellationTokenSource.CreateLinkedTokenSource(cancelToken);
            headerCts.CancelAfter(TimeSpan.FromSeconds(_llmSopSettings.Value.HeaderTimeoutSeconds));

            // 6. LLM 호출 (헤더만 수신) — Success 판정 단계. 실패 시 동기 응답으로 즉시 반환
            HttpResponseMessage response;
            try
            {
                response = await httpClient.SendAsync(
                    request, HttpCompletionOption.ResponseHeadersRead, headerCts.Token);
            }
            catch (OperationCanceledException) when (!cancelToken.IsCancellationRequested)
            {
                // 호출자 취소가 아닌 헤더 타임아웃
                request.Dispose();
                //throw new TimeoutException("LLM SOP 서비스 응답 헤더 수신 타임아웃");
                throw new Exception("LLM SOP 서비스 응답 헤더 수신 타임아웃");
            }
            catch (HttpRequestException ex)
            {
                request.Dispose();
                //throw new HttpRequestException($"LLM SOP 서비스 통신 실패: {ex.Message}");
                throw new Exception($"LLM SOP 서비스 통신 실패: {ex.Message}");
            }

            if (!response.IsSuccessStatusCode)
            {
                // 비정상 HTTP 상태 코드 — 자원 정리 후 Success=false 반환
                request.Dispose();
                response.Dispose();
                //throw new HttpRequestException($"LLM SOP 서비스 비정상 응답: {(int)response.StatusCode}");
                throw new Exception($"LLM SOP 서비스 비정상 응답: {(int)response.StatusCode}");
            }

            // 7. 백그라운드 작업 등록 — response/request Dispose 책임 백그라운드로 이관
            await _taskQueue.QueueBackgroundWorkItemAsync(async bgCancelToken =>
            {
                try
                {
                    await ProcessLLMSopStreamAsync(response, groupNm, bgCancelToken);
                }
                finally
                {
                    response.Dispose();
                    request.Dispose();
                }
            });

            // 8. 동기 응답 — GroupNm 반환. 클라이언트는 이 GroupNm으로 SignalR 그룹 가입
            return new LLMSopFlowChartResponse
            {
                GroupNm = groupNm,
                ResultMessage = "처리를 시작했습니다. SignalR 그룹에 가입하여 결과를 수신하세요."
            };
        }

        /// <summary>
        /// SSE 응답 본문 스트림을 라인 단위로 파싱하여 이벤트별로 SignalR 그룹에 푸시한다.
        /// 백그라운드 작업으로 실행되며, 예외는 OnLLMError 이벤트로 전달 후 종료.
        /// </summary>
        /// <param name="response">헤더 수신 완료 상태의 HttpResponseMessage (본문은 미수신)</param>
        /// <param name="groupNm">SignalR 그룹명 (클라이언트가 join 대기 중)</param>
        /// <param name="bgCancelToken">백그라운드 호스트 수명주기 취소 토큰</param>
        private async Task ProcessLLMSopStreamAsync(
            HttpResponseMessage response,
            string groupNm,
            CancellationToken bgCancelToken)
        {
            var jsonOptions = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                PropertyNameCaseInsensitive = true,
                NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowNamedFloatingPointLiterals
            };

            try
            {
                // 1. 응답 본문 스트림 획득 및 라인 단위 SSE 파싱 루프
                await using var stream = await response.Content.ReadAsStreamAsync(bgCancelToken);
                using var reader = new StreamReader(stream, Encoding.UTF8);

                while (!bgCancelToken.IsCancellationRequested)
                {
                    var line = await reader.ReadLineAsync(bgCancelToken);
                    if (line is null) break;                        // 스트림 종료
                    if (line.Length == 0) continue;                 // 이벤트 경계 빈 줄
                    if (line.StartsWith(':')) continue;             // SSE 코멘트
                    if (!line.StartsWith("data:", StringComparison.Ordinal)) continue; // data 필드만 처리

                    // "data: " (공백 1개) 트림 후 페이로드 추출
                    var payload = line.Length > 5 && line[5] == ' ' ? line[6..] : line[5..];
                    if (payload == "[DONE]") break;                 // 종료 sentinel

                    // 2. 이벤트 종류별 SignalR 디스패치
                    await DispatchSseEventAsync(payload, jsonOptions, groupNm, bgCancelToken);
                }
            }
            catch (Exception ex)
            {
                // 3. 백그라운드 예외는 OnLLMError 푸시로만 전달 (서비스 외부로 throw 안 함)
                await SafeSendAsync(groupNm, "OnLLMError",
                    $"SSE 스트림 처리 실패: {ex.Message}", bgCancelToken);
            }
        }

        /// <summary>
        /// SSE data 페이로드 1건을 JSON 파싱하여 이벤트 종류별 SignalR 메서드로 푸시한다.
        /// </summary>
        /// <param name="payload">"data:" 접두사 제거된 JSON 페이로드</param>
        /// <param name="options">역직렬화 옵션</param>
        /// <param name="groupNm">SignalR 대상 그룹명</param>
        /// <param name="bgCancelToken">백그라운드 취소 토큰</param>
        private async Task DispatchSseEventAsync(
            string payload,
            JsonSerializerOptions options,
            string groupNm,
            CancellationToken bgCancelToken)
        {
            JsonDocument? doc = null;
            try
            {
                // 1. JSON 문서 파싱
                doc = JsonDocument.Parse(payload);
                var root = doc.RootElement;

                // 2. 이벤트 종류별 SignalR 푸시
                if (root.TryGetProperty("__compn__", out var compnEl))
                {
                    var compn = DeserializeLlmCompn(compnEl, options); // 기존 헬퍼 재사용
                    if (compn is not null)
                        await SafeSendAsync(groupNm, "LLMCompn", JsonSerializer.Serialize(compn), bgCancelToken); // 컴포넌트 노드 데이터
                    return;
                }
                if (root.TryGetProperty("__status__", out var statusEl))
                {
                    await SafeSendAsync(groupNm, "LLMStatus", statusEl.GetString() ?? "", bgCancelToken); // 진행 단계: searching/reranking/generating
                }
                else if (root.TryGetProperty("__thinking__", out var thinkEl))
                {
                    await SafeSendAsync(groupNm, "LLMThinking", thinkEl.GetString() ?? "", bgCancelToken); // LLM 추론 텍스트
                }
                else if (root.TryGetProperty("__sources__", out var sourcesEl))
                {
                    // RAG 출처 항목을 익명 객체 리스트로 변환 (SignalR JSON 직렬화 시 camelCase로 전송됨)
                    var items = sourcesEl.ValueKind == JsonValueKind.Array
                        ? sourcesEl.EnumerateArray()
                            .Select(s => new
                            {
                                fileName = s.TryGetProperty("fileName", out var f) ? f.GetString() ?? "" : "",
                                score    = s.TryGetProperty("score",    out var sc) && sc.ValueKind == JsonValueKind.Number ? sc.GetDouble() : 0.0,
                                text     = s.TryGetProperty("text",     out var t) ? t.GetString() ?? "" : ""
                            })
                            .ToList<object>()
                        : new List<object>();

                    // RAG 출처 목록 제외 처리
                    //await SafeSendAsync(groupNm, "LLMSources", JsonSerializer.Serialize(items), bgCancelToken); // RAG 출처 목록
                }
                else if (root.TryGetProperty("__done__", out var doneEl))
                {
                    var fn = doneEl.TryGetProperty("filename", out var f) ? f.GetString() ?? "" : "";
                    var cnt = doneEl.TryGetProperty("count", out var c) ? c.GetInt32() : 0;
                    // 생성 완료 메타 제외 처리
                    //await SafeSendAsync(groupNm, "LLMDone", JsonSerializer.Serialize(new { filename = fn, count = cnt }), bgCancelToken); // 생성 완료 메타
                }
                else if (root.TryGetProperty("__error__", out var errEl))
                {
                    await SafeSendAsync(groupNm, "Error", errEl.GetString() ?? "", bgCancelToken); // 외부 서비스 보고 오류
                }
            }
            catch (JsonException ex)
            {
                // 3. 페이로드 파싱 실패 — OnLLMError로 전달
                await SafeSendAsync(groupNm, "Error",
                    $"SSE 페이로드 파싱 실패: {ex.Message}", bgCancelToken);
            }
            finally
            {
                doc?.Dispose();
            }
        }

        /// <summary>
        /// SignalR 그룹으로 메시지를 안전하게 전송한다. 그룹이 비었거나 연결이 끊긴 경우 무시.
        /// </summary>
        private async Task SafeSendAsync(string groupNm, string method, string payload, CancellationToken cancelToken)
        {
            try
            {
                //await _hubContext.Clients.Group(groupNm).SendAsync(method, payload, cancelToken);
                var hubMessage = new HubMessageParams
                {
                    Subject = method,
                    Action = payload,
                    TargetSns = new List<object>()
                };

                string pushJson = _hubPublisherService.MakeMessage(hubMessage);
                await _hubPublisherService.SendMessageToGroup(groupNm, pushJson);
            }
            catch
            {
                // 그룹 비어있거나 연결 끊김 — 백그라운드 작업 자체는 계속 진행
            }
        }

        /// <summary>
        /// __compn__ JsonElement를 중간 DTO로 역직렬화한 뒤 CompnSaveParams로 안전 매핑한다.
        /// (NpgsqlPoint의 System.Text.Json 직렬화 호환성이 보장되지 않아 좌표만 별도 DTO 경유)
        /// </summary>
        /// <param name="el">__compn__ JsonElement</param>
        /// <param name="options">역직렬화 옵션</param>
        /// <returns>매핑된 CompnSaveParams, dto가 null이면 null</returns>
        private static CompnSaveParams? DeserializeLlmCompn(JsonElement el, JsonSerializerOptions options)
        {
            // 1. JsonElement → 중간 DTO 역직렬화
            var dto = el.Deserialize<LlmCompnDto>(options);
            if (dto is null) return null;

            // 2. CompnSaveParams로 명시적 매핑 — NpgsqlPoint는 (X,Y) 좌표로 직접 생성
            return new CompnSaveParams
            {
                CompnSn = dto.CompnSn,
                EndCompns = dto.EndCompns,
                CompnGroupSn = dto.CompnGroupSn,
                CompnTyCode = dto.CompnTyCode,
                CompnSj = dto.CompnSj,
                CompnCrdnt = new NpgsqlPoint(dto.CompnCrdnt?.X ?? 0d, dto.CompnCrdnt?.Y ?? 0d),
                Width = dto.Width,
                Hg = dto.Hg,
                AtmcProgrsYn = dto.AtmcProgrsYn ?? "N",
                CharstSort = dto.CharstSort,
                FontSize = dto.FontSize,
                Color = dto.Color,
                CompnAttrbSaveParamsList = dto.CompnAttrbSaveParamsList
            };
        }

        /// <summary> __compn__ 좌표 직렬화용 중간 DTO (NpgsqlPoint 우회) </summary>
        private sealed record LlmCompnCrdntDto(double X, double Y);

        /// <summary> __compn__ 페이로드 역직렬화용 중간 DTO </summary>
        private sealed record LlmCompnDto
        {
            public long CompnSn { get; init; }
            public List<CompnArrw>? EndCompns { get; init; }
            public long? CompnGroupSn { get; init; }
            public string CompnTyCode { get; init; } = "";
            public string? CompnSj { get; init; }
            public LlmCompnCrdntDto? CompnCrdnt { get; init; }
            public int Width { get; init; }
            public int Hg { get; init; }
            public string? AtmcProgrsYn { get; init; }
            public string? CharstSort { get; init; }
            public short? FontSize { get; init; }
            public string? Color { get; init; }
            public List<CompnAttrbSaveParams>? CompnAttrbSaveParamsList { get; init; }
        }
    }
}
