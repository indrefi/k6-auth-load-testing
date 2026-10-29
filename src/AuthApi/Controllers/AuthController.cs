using AuthApi.Models;
using AuthApi.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthApi.Controllers;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public sealed class AuthController(
    CredentialValidator credentials,
    JwtTokenService tokens) : ControllerBase
{
    [HttpPost("login")]
    [ProducesResponseType<TokenResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ApiError>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ApiError>(StatusCodes.Status401Unauthorized)]
    public IActionResult Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new ApiError("Username and password are required."));
        }

        return credentials.Validate(request.Username, request.Password)
            ? Ok(tokens.Create(request.Username))
            : Unauthorized(new ApiError("Invalid username or password."));
    }
}

