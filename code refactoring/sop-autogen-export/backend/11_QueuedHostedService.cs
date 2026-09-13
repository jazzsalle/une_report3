using System.Threading.Channels;

namespace Une.Protecto.FoundationService.Services
{
    // https://learn.microsoft.com/ko-kr/dotnet/core/extensions/queue-service

    public sealed class QueuedHostedService(IBackgroundTaskQueue taskQueue, ILogger<QueuedHostedService> logger) : BackgroundService
    {
        /// <summary>
        /// B5-10. 종료 시작 후 남은 작업을 마무리할 수 있는 시간.
        ///
        /// <para>
        /// 호스트가 기다려 주는 총량은 <c>ShutdownTimeout</c> = <b>30초</b>(실측)이고,
        /// 워커는 <b>하나씩 순서대로</b> 멈춘다(<c>ServicesStopConcurrently=False</c>).
        /// 이 워커는 등록 역순상 <b>마지막</b>에 멈추므로 앞의 셋(3+3+4=10초)을 뺀 몫을 쓴다.
        /// 15초를 쓰면 합이 25초라 호스트 정리용 5초가 남는다.
        /// </para>
        ///
        /// <para>
        /// 🔴 이 값을 올릴 때는 <b>다른 셋과의 합이 30초를 넘지 않는지</b> 확인해야 한다.
        /// 넘기면 호스트가 기다리지 않고 강제 종료해 <b>기다린 의미가 사라진다.</b>
        /// 합계 검사는 <c>GracefulShutdownBudgetTests</c> 가 한다.
        /// </para>
        /// </summary>
        public static readonly TimeSpan DrainGrace = TimeSpan.FromSeconds(15);

        /// <summary>
        /// B5-10. <b>작업에 넘기는</b> 취소 토큰의 원본.
        ///
        /// <para>
        /// 기존에는 호스트의 종료 신호(<c>stoppingToken</c>)를 작업에 그대로 넘겼다.
        /// 작업들이 그 신호를 성실히 따르기 때문에 <b>진행 중이던 상황전파 문자가 중간에 끊겼다.</b>
        /// 종료 신호와 분리해 <see cref="DrainGrace"/> 동안은 작업이 계속 진행할 수 있게 한다.
        /// </para>
        /// </summary>
        private readonly CancellationTokenSource _workItemCts = new();

        /// <summary>B5-10. 배수 루프 자체의 상한. <see cref="DrainGrace"/> 후 끊는다.</summary>
        private readonly CancellationTokenSource _drainCts = new();

        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            logger.LogInformation("""
            {Name} is running.
            """,
                nameof(QueuedHostedService));

            return ProcessTaskQueueAsync();
        }

        /// <remarks>
        /// B5-10. 🔴 <c>stoppingToken</c> 을 루프 조건으로 쓰지 않는다.
        /// 그것은 "종료 시작" 신호라서 조건으로 쓰면 <b>큐에 남은 작업을 버리고 즉시 빠져나간다.</b>
        /// 대신 <see cref="StopAsync"/> 가 큐를 닫고, 루프는 <b>다 비워질 때까지</b> 돈다.
        ///
        /// <para>
        /// 이 메서드는 <b>여러 번·동시에 불려도 안전하다.</b> 채널이 스레드 안전해서
        /// 두 호출이 같은 작업을 두 번 꺼내지 않는다. <see cref="StopAsync"/> 가 이 성질에 기댄다.
        /// </para>
        /// </remarks>
        private async Task ProcessTaskQueueAsync()
        {
            while (!_drainCts.IsCancellationRequested)
            {
                Func<CancellationToken, ValueTask>? workItem;

                try
                {
                    workItem = await taskQueue.DequeueAsync(_drainCts.Token);
                }
                catch (ChannelClosedException)
                {
                    // 큐를 닫았고 남은 것도 다 꺼냈다. 정상 종료 경로다.
                    break;
                }
                catch (OperationCanceledException)
                {
                    // 상한을 넘겼다. 남은 것이 있어도 여기서 멈춘다.
                    break;
                }

                try
                {
                    await workItem(_workItemCts.Token);
                }
                catch (OperationCanceledException)
                {
                    // B5-10. 상한 안에 못 끝나 잘렸다. 🔴 조용히 넘기면 유실을 아무도 모른다.
                    logger.LogWarning(
                        "서버 종료 중 백그라운드 작업이 상한({Grace}초)을 넘겨 중단됐습니다.",
                        DrainGrace.TotalSeconds);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error occurred executing task work item.");
                }
            }
        }

        public override async Task StopAsync(CancellationToken stoppingToken)
        {
            logger.LogInformation(
                $"{nameof(QueuedHostedService)} is stopping.");

            // B5-10. ① 새 작업을 받지 않는다. 남은 것을 다 꺼내면 루프가 스스로 끝난다.
            taskQueue.CompleteAdding();

            // B5-10. ② 상한을 건다. 그때까지는 작업이 "아직 종료 아님" 으로 보고 진행한다.
            _workItemCts.CancelAfter(DrainGrace);
            _drainCts.CancelAfter(DrainGrace);

            // B5-10. ③ 이미 돌고 있는 루프가 끝나기를 기다린다.
            await base.StopAsync(stoppingToken);

            // B5-10. ④ 🔴 이 한 줄이 없으면 큐가 통째로 사라지는 경우가 있다.
            //
            //   ExecuteAsync 의 본문은 StartAsync 안에서 곧바로 도는 것이 아니라 나중에 시작된다.
            //   시작 직후 종료가 걸리면 본문이 한 번도 실행되지 않은 채 취소되고,
            //   base.StopAsync 는 그 작업이 끝났다고 보고 즉시 돌아온다.
            //   🔴 실측으로 200회 중 89회에서 대기 중이던 4건이 전부 사라졌다.
            //
            //   루프가 이미 다 비웠다면 여기서는 곧바로 ChannelClosedException 이 나서 아무 일도 하지 않는다.
            await ProcessTaskQueueAsync();

            var rejected = taskQueue.RejectedAfterCompleteCount;
            if (rejected > 0)
            {
                logger.LogWarning(
                    "서버 종료 중이라 백그라운드 작업 {Count}건을 받지 못했습니다.", rejected);
            }
        }

        public override void Dispose()
        {
            _workItemCts.Dispose();
            _drainCts.Dispose();
            base.Dispose();
        }
    }
}
