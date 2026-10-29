using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace AuthApi.Security;

public sealed class OpenApiSecurityDocumentTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        document.Info = new OpenApiInfo
        {
            Title = "AuthLoadDemo API",
            Version = "v1",
            Description = "Manual interface for the open, JWT, client-certificate, and Basic authentication endpoints."
        };
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes = new Dictionary<string, IOpenApiSecurityScheme>
        {
            [AuthSchemes.Jwt] = new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                Description = "Paste only the JWT returned by POST /api/auth/login."
            },
            [AuthSchemes.Basic] = new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "basic",
                Description = "Enter the configured API username and password."
            },
            [AuthSchemes.Certificate] = new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.MutualTLS,
                Description = "The browser must present a trusted client certificate during the TLS handshake."
            }
        };

        return Task.CompletedTask;
    }
}
