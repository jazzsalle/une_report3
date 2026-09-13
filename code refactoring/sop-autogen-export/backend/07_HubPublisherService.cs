using Microsoft.AspNetCore.SignalR;
using System.Text.Json;
using Une.Protecto.FoundationService.Models;

namespace Une.Protecto.FoundationService.Services.Hubs
{
    public interface IHubPublisherService
    {
        /// <summary>
        /// 모든 그룹에 푸시
        /// </summary>
        Task SendMessageToAll(string message);
        /// <summary>
        /// 특정 그룹에 푸시
        /// </summary>
        Task SendMessageToGroup(string groupNm, string message);
        /// <summary>
        /// 푸시 메시지 만들기
        /// </summary>
        string MakeMessage(HubMessageParams messageParams);
    }

    /// <summary>
    /// (DI Singleton) 서버 -> 클라이언트 발신 전용
    /// </summary>
    public class HubPublisherService : IHubPublisherService
    {
        private readonly IHubContext<ProtectoHub> _hubContext;

        public HubPublisherService(IHubContext<ProtectoHub> hubContext)
        {
            _hubContext = hubContext;
        }

        /// <summary>
        /// 모든 그룹에 푸시
        /// </summary>
        public async Task SendMessageToAll(string message)
        {
            await _hubContext.Clients.All.SendAsync("SendMessageToAll", "OMS", message);
        }

        /// <summary>
        /// 특정 그룹에 푸시
        /// </summary>
        public async Task SendMessageToGroup(string groupNm, string message)
        {
            await _hubContext.Clients.Group(groupNm).SendAsync("SendMessageToGroup", "OMS", message);
        }

        /// <summary>
        /// 푸시 메시지 만들기
        /// </summary>
        public string MakeMessage(HubMessageParams messageParams)
        {
            var message = new Dictionary<string, object>
            {
                { "subject", messageParams.Subject },
                { "action", messageParams.Action },
                { "targetSns", messageParams.TargetSns },
                { "timestamp", DateTime.Now }
            };

            if (!string.IsNullOrEmpty(messageParams.ActionType))
            {
                message.Add("actionType", messageParams.ActionType);
            }

            if (messageParams.RelatedSns != null)
            {
                message.Add("relatedSns", messageParams.RelatedSns);
            }

            return JsonSerializer.Serialize(message);
        }

        /// <summary>
        /// 그룹명 정의
        /// </summary>
        public static class GroupName
        {
            public const string SOR = "SOR";
            public const string SOE = "SOE";

            public static string Execut(string sopExecutId) => $"SOR:{sopExecutId}";

            public const string MNT = "MNT";
        }

        /// <summary>
        /// 이벤트 주제명 정의
        /// </summary>
        public static class Subject
        {
            /// <summary>
            /// 알람 (발생 및 종료)
            /// </summary>
            public const string Alarm = "Alarm";

            /// <summary>
            /// SOP 실행 (실행 및 종료)
            /// </summary>
            public const string SopExecution = "SopExecution";

            /// <summary>
            /// SOP 컴포넌트 진행 내역 (추가)
            /// </summary>
            public const string SopComponentExecution = "SopComponentExecution";

            /// <summary>
            /// SOP 실행자 (위임)
            /// </summary>
            public const string SopExecutant = "SopExecutant";

            /// <summary>
            /// SOP 관찰자 (등록 및 삭제)
            /// </summary>
            public const string SopObserver = "SopObserver";

            /// <summary>
            /// 알람 연계 SOP 상태
            /// </summary>
            public const string AlarmSopStatus = "AlarmSopStatus";
        }

        /// <summary>
        /// 이벤트 액션명 정의
        /// </summary>
        public static class Action
        {
            public const string Created = "Created";
            public const string Updated = "Updated";
            public const string Deleted = "Deleted";
        }
    }

    /// <summary>
    /// 이벤트 메시지 파라미터
    /// </summary>
    public class HubMessageParams
    {
        /// <summary>
        /// 주제
        /// </summary>
        public string Subject { get; set; } = null!;

        /// <summary>
        /// 액션
        /// </summary>
        public string Action { get; set; } = null!;

        /// <summary>
        /// 1. SOP 종료의 ActionType : User(사용자 종료),AlarmEnd(알람 종료),WaitTimeout(대기시간초과)
        /// 2. SOP 수정의 ActionType : LinkedAlarm(알람 매핑 추가), ClearedAlarm(모든 알람 매핑 삭제), SwitchedSop(SOP 전환)
        /// </summary>
        public string? ActionType { get; set; }

        /// <summary>
        /// 
        /// </summary>
        public List<object> TargetSns { get; set; } = null!;


        /// <summary>
        /// 
        /// </summary>
        public List<long>? RelatedSns { get; set; }
    }
}
