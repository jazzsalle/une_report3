namespace Une.Protecto.FoundationService.Models.Responses
{
    public class LLMSopFlowChartResponse
    {
        /// <summary>
        /// SignalR 그룹 이름
        /// </summary>
        public string GroupNm { get; set; } = null!;
        /// <summary>
        /// 결과 메시지
        /// </summary>
        public string? ResultMessage { get;set; }
    }
}
