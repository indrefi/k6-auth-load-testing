using System.ComponentModel.DataAnnotations;

namespace AuthApi.Models;

public sealed record LoginRequest(
    [param: Required, MinLength(1)] string Username,
    [param: Required, MinLength(1)] string Password);

public sealed record TokenResponse(string AccessToken, string TokenType, int ExpiresIn);

public sealed record DataWriteRequest(
    [param: Required, MinLength(1), MaxLength(500)] string Value);

public sealed record DataRecord(Guid Id, string Value, string SubmittedBy, DateTimeOffset CreatedAt);

public sealed record ApiError(string Error);

