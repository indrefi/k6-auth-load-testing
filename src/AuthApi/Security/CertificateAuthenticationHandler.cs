using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace AuthApi.Security;

public sealed class CertificateAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    ClientCertificateValidator validator)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var certificate = await Context.Connection.GetClientCertificateAsync();
        if (certificate is null)
        {
            return AuthenticateResult.NoResult();
        }

        if (!validator.Validate(certificate, out var identityName))
        {
            return AuthenticateResult.Fail("The client certificate is not trusted.");
        }

        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, certificate.Thumbprint),
                new Claim(ClaimTypes.Name, identityName),
                new Claim("certificate_thumbprint", certificate.Thumbprint)
            ],
            AuthSchemes.Certificate);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), AuthSchemes.Certificate);
        return AuthenticateResult.Success(ticket);
    }
}

