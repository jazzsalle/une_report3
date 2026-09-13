namespace Une.Protecto.FoundationService.Services
{
    // https://learn.microsoft.com/ko-kr/dotnet/core/extensions/queue-service

    public interface IBackgroundTaskQueue
    {
        ValueTask QueueBackgroundWorkItemAsync(Func<CancellationToken, ValueTask> workItem);

        ValueTask<Func<CancellationToken, ValueTask>> DequeueAsync(CancellationToken cancellationToken);

        /// <summary>
        /// B5-10. 큐를 닫는다. 종료 시작 시 <see cref="QueuedHostedService"/> 가 부른다.
        ///
        /// <para>
        /// 닫은 뒤에는 새 작업을 받지 않고, <see cref="DequeueAsync"/> 는 <b>이미 들어와 있는 것을
        /// 전부 돌려준 뒤</b> <see cref="System.Threading.Channels.ChannelClosedException"/> 로 끝을 알린다.
        /// 배수 루프가 "몇 개 남았는지" 를 셀 필요가 없게 하려는 것이다.
        /// </para>
        /// </summary>
        void CompleteAdding();

        /// <summary>
        /// B5-10. 큐가 닫힌 뒤 등록을 시도했다가 거절된 작업 수.
        ///
        /// <para>
        /// 거절은 예외로 올리지 않는다 — 종료 중인 서버가 API 요청에 500 을 돌려주게 되기 때문이다.
        /// 대신 여기에 세어 두고 <see cref="QueuedHostedService"/> 가 종료 마지막에 로그로 남긴다.
        /// <b>세지 않으면 조용히 사라진 작업을 아무도 모른다.</b>
        /// </para>
        /// </summary>
        int RejectedAfterCompleteCount { get; }
    }
}
