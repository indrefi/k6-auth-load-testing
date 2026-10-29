using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthApi.Controllers;

[ApiController]
[AllowAnonymous]
public sealed class SystemController : ControllerBase
{
    [HttpGet("/health")]
    public IActionResult Health() =>
        Ok(new { status = "healthy", timestamp = DateTimeOffset.UtcNow });
}

