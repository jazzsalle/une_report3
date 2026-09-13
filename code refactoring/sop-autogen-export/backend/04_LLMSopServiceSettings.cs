namespace Une.Protecto.FoundationService.Models.Settings
{
    /// <summary> appsettings.json의 LLMSopService 연결 설정 </summary>
    public class LLMSopServiceSettings
    {
        public string BaseUrl { get; set; } = null!;
        /// <summary> 헤더 수신까지 대기 타임아웃(초). 스트리밍 본문 전체에는 적용되지 않음 </summary>
        public int HeaderTimeoutSeconds { get; set; } = 60;
    }
}
