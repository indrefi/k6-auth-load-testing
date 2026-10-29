using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace AuthApi.Security;

public sealed class BasicAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    CredentialValidator credentials)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("Authorization", out var header) ||
            !header.ToString().StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        try
        {
            var encoded = header.ToString()["Basic ".Length..].Trim();
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
            var separator = decoded.IndexOf(':');
            if (separator <= 0)
            {
                return Task.FromResult(AuthenticateResult.Fail("Invalid Basic authentication value."));
            }

            var username = decoded[..separator];
            var password = decoded[(separator + 1)..];
            if (!credentials.Validate(username, password))
            {
                return Task.FromResult(AuthenticateResult.Fail("Invalid username or password."));
            }

            var principal = CreatePrincipal(username, AuthSchemes.Basic);
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(principal, AuthSchemes.Basic)));
        }
        catch (FormatException)
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid Basic authentication encoding."));
        }
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.Headers.WWWAuthenticate = "Basic realm=\"AuthLoadDemo\", charset=\"UTF-8\"";
        await base.HandleChallengeAsync(properties);
    }

    private static ClaimsPrincipal CreatePrincipal(string username, string scheme)
    {
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, username), new Claim(ClaimTypes.Name, username)],
            scheme);
        return new ClaimsPrincipal(identity);
    }
}

