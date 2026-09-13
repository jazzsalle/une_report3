// ═════════════════════════════════════════════════════════════════════════════
//  [발췌] SOP 자동생성(LLM) 관련 DI / 미들웨어 등록
//  원본: protectofoundationservice/Program.cs
// ═════════════════════════════════════════════════════════════════════════════

// ── L63: LLM 서비스 설정 바인딩 ────────────────────────────────────────────
builder.Services.Configure<LLMSopServiceSettings>(builder.Configuration.GetSection("LLMSopService"));

// ── L175~183: 백그라운드 작업 큐 (SSE 스트림 파싱을 백그라운드로 이관) ────
builder.Services.AddHostedService<QueuedHostedService>();
builder.Services.AddSingleton<IBackgroundTaskQueue>(_ =>
{
    if (!int.TryParse(builder.Configuration["QueueCapacity"], out var queueCapacity))
    {
        queueCapacity = 1000;
    }

    return new DefaultBackgroundTaskQueue(queueCapacity);

// ── L222~223: HttpClientFactory + SOP 편집 서비스 ─────────────────────────
builder.Services.AddHttpClient();
builder.Services.AddScoped<ISopEditService, SopEditService>();

// ── L230: SignalR 푸시 퍼블리셔 ──────────────────────────────────────────
builder.Services.AddSingleton<IHubPublisherService, HubPublisherService>();

// ── L315: SignalR 허브 매핑 (프론트가 접속하는 엔드포인트) ───────────────
app.MapHub<ProtectoHub>("/oms-hub");
