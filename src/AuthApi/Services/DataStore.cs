using System.Collections.Concurrent;
using AuthApi.Models;

namespace AuthApi.Services;

public sealed class DataStore
{
    private readonly ConcurrentQueue<DataRecord> _records = new();

    public DataStore()
    {
        _records.Enqueue(new DataRecord(
            Guid.NewGuid(),
            "The API is ready for load testing.",
            "system",
            DateTimeOffset.UtcNow));
    }

    public IReadOnlyCollection<DataRecord> GetAll() => _records.ToArray();

    public DataRecord Add(string value, string submittedBy)
    {
        var record = new DataRecord(Guid.NewGuid(), value, submittedBy, DateTimeOffset.UtcNow);
        _records.Enqueue(record);
        return record;
    }
}

