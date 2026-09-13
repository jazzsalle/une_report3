using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using OpenSearch.Client;
using Une.Protecto.FoundationService.Models;
using Une.Protecto.FoundationService.Models.OpenSearchIndex;
using Une.Protecto.FoundationService.Models.Settings;

namespace Une.Protecto.FoundationService.Services.Hubs
{
    /// <summary>
    /// (SignalR Transient) 클라이언트 -> 서버 수신 전용
    /// </summary>
    public class ProtectoHub : Hub
    {
        private readonly IHubPublisherService _hubPublisherService;
        private readonly IObserverPresenceTracker _tracker;
        private readonly OpenSearchClient _osClient;
        private readonly OpenSearchIndexNames _osIndexNames;
        //private static HashSet<string> ConnectedClients = new HashSet<string>(); // 연결된 클라이언트들의 관리가 필요할 때 사용

        public ProtectoHub(IHubPublisherService hubPublisherService, IObserverPresenceTracker tracker, IOptions<OpenSearchSettings> openSearchOptions)
        {
            _hubPublisherService = hubPublisherService;
            _tracker = tracker;
            var osSettings = openSearchOptions.Value;
            _osClient = new OpenSearchClient(new Uri(osSettings.Uri));
            _osIndexNames = osSettings.IndexNames;
        }

        //public override Task OnConnectedAsync()
        //{
        //    ConnectedClients.Add(Context.ConnectionId);
        //    return base.OnConnectedAsync();
        //}

        /// <summary>
        /// 그룹에 추가
        /// </summary>
        /// <param name="groupNm"></param>
        /// <returns></returns>
        public async Task AddGroup(string groupNm)
        {
            // PresenceTracker 정합성 보장을 위해 SOR:{id} 가입은 JoinSopObserver 경유
            if (groupNm.StartsWith(HubPublisherService.GroupName.SOR + ":"))
                throw new HubException("INVALID_GROUP");

            await Groups.AddToGroupAsync(Context.ConnectionId, groupNm);
            await Clients.Group(groupNm).SendAsync("ReceiveMessage", "OMS", $"{groupNm}에 추가되었습니다.");
        }

        /// <summary>
        /// 그룹에서 삭제
        /// </summary>
        /// <param name="groupNm"></param>
        public async Task RemoveGroup(string groupNm)
        {
            // PresenceTracker 정합성 보장을 위해 SOR:{id} 이탈은 LeaveSopObserver 경유 필수
            if (groupNm.StartsWith(HubPublisherService.GroupName.SOR + ":"))
                throw new HubException("INVALID_GROUP");

            await Clients.Group(groupNm).SendAsync("ReceiveMessage", "OMS", $"{groupNm}에서 삭제되었습니다.");
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupNm);
        }

        /// <summary>
        /// SOP 상세 화면 진입 처리
        /// </summary>
        /// <param name="sopExecutId"></param>
        /// <returns></returns>
        /// <exception cref="HubException"></exception>
        public async Task JoinSopObserver(string sopExecutId)
        {
            // SOR:{sopExecutId} 그룹 가입 + PresenceTracker 등록
            // tracker에 UserSn을 최초 등록해야 하므로 userContext 필요
            var userContext = Context.GetHttpContext()?.Items["UserContext"] as UserContext;
            if (userContext is null || userContext.IsAnonymous)
                throw new HubException("UNAUTHORIZED");

            // SOP 실행 유효성 검증 (Tracker 오염 방지)
            var searchRes = await _osClient.GetAsync<SopExecutIndex>(sopExecutId, idx => idx.Index(_osIndexNames.SopExecut));
            var sopExecut = searchRes.Source ?? throw new HubException("INVALID_SOP");
            if (sopExecut.EndDt is not null)
                throw new HubException("ENDED_SOP");
            if (sopExecut.RealModeYn != "Y")
                throw new HubException("INVALID_SOP");

            await Groups.AddToGroupAsync(Context.ConnectionId, HubPublisherService.GroupName.Execut(sopExecutId));
            await Groups.AddToGroupAsync(Context.ConnectionId, HubPublisherService.GroupName.SOR); // SOR:{id} 구독자는 항상 SOR 구독 보장
            var firstForUser = _tracker.Join(sopExecutId, Context.ConnectionId, userContext.UserSn);

            if (firstForUser)
                await PushObserverChange(sopExecutId, HubPublisherService.Action.Created);
        }

        /// <summary>
        /// SOP 상세 화면 이탈 처리
        /// </summary>
        /// <param name="sopExecutId"></param>
        /// <returns></returns>
        public async Task LeaveSopObserver(string sopExecutId)
        {
            // PresenceTracker 해제 + SOR:{sopExecutId} 그룹 탈퇴
            var lastForUser = _tracker.Leave(sopExecutId, Context.ConnectionId);

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, HubPublisherService.GroupName.Execut(sopExecutId));

            if (lastForUser)
            {
                await PushObserverChange(sopExecutId, HubPublisherService.Action.Deleted);
            }
        }

        /// <summary>
        /// 비정상 이탈 처리 (브라우저 종료, 네트워크 단절 등)
        /// </summary>
        /// <param name="exception"></param>
        /// <returns></returns>
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var changes = _tracker.RemoveByConnection(Context.ConnectionId);
            foreach (var (sopExecutId, _, lastForUser) in changes)
            {
                if (lastForUser)
                {
                    await PushObserverChange(sopExecutId, HubPublisherService.Action.Deleted);
                }
            }
            await base.OnDisconnectedAsync(exception);
        }

        /// <summary>
        /// 관찰자 상태 변경 시 이벤트 발행
        /// </summary>
        /// <param name="sopExecutId"></param>
        /// <param name="action"></param>
        /// <returns></returns>
        private async Task PushObserverChange(string sopExecutId, string action)
        {
            // (SignalR) 관찰자 상태 변경 푸시
            var sopObserverHubMessage = new HubMessageParams
            {
                Subject = HubPublisherService.Subject.SopObserver,
                Action = action,
                TargetSns = new List<object> { sopExecutId }
            };

            string pushJson = _hubPublisherService.MakeMessage(sopObserverHubMessage);
            await _hubPublisherService.SendMessageToGroup(HubPublisherService.GroupName.Execut(sopExecutId), pushJson);
        }
    }
}
