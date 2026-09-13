using System.Threading.Channels;

namespace Une.Protecto.FoundationService.Services
{
    // https://learn.microsoft.com/ko-kr/dotnet/core/extensions/queue-service

    public class DefaultBackgroundTaskQueue : IBackgroundTaskQueue
    {
        private readonly Channel<Func<CancellationToken, ValueTask>> _queue;

        /// <summary>B5-10. 큐가 닫힌 뒤 거절된 작업 수.</summary>
        private int _rejectedAfterComplete;

        /// <inheritdoc />
        public int RejectedAfterCompleteCount => Volatile.Read(ref _rejectedAfterComplete);

        public DefaultBackgroundTaskQueue(int capacity)
        {
            BoundedChannelOptions options = new(capacity)
            {
                FullMode = BoundedChannelFullMode.Wait
            };
            _queue = Channel.CreateBounded<Func<CancellationToken, ValueTask>>(options);
        }

        public async ValueTask QueueBackgroundWorkItemAsync(
            Func<CancellationToken, ValueTask> workItem)
        {
            ArgumentNullException.ThrowIfNull(workItem);

            try
            {
                await _queue.Writer.WriteAsync(workItem);
            }
            catch (ChannelClosedException)
            {
                // B5-10. 서버가 종료 중이라 큐가 닫혔다.
                // 🔴 예외를 위로 올리면 이 시점에 들어온 API 요청이 500 을 받는다.
                //    삼키되 반드시 센다 — 안 세면 사라진 작업을 아무도 모른다.
                Interlocked.Increment(ref _rejectedAfterComplete);
            }
        }

        /// <inheritdoc />
        public void CompleteAdding()
        {
            // TryComplete 다 — 두 번 불려도 예외가 나지 않는다.
            _queue.Writer.TryComplete();
        }

        public async ValueTask<Func<CancellationToken, ValueTask>> DequeueAsync(
            CancellationToken cancellationToken)
        {
            Func<CancellationToken, ValueTask>? workItem =
                await _queue.Reader.ReadAsync(cancellationToken);

            return workItem;
        }
    }
}
