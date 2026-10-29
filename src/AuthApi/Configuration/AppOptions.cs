namespace AuthApi.Configuration;

public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    public string Username { get; init; } = "load-user";
    public string Password { get; init; } = "change-me-now";
    public string JwtSigningKey { get; init; } = "development-only-signing-key-change-this-32-bytes";
    public string JwtIssuer { get; init; } = "AuthLoadDemo";
    public string JwtAudience { get; init; } = "AuthLoadDemoClients";
    public int JwtLifetimeMinutes { get; init; } = 15;
    public string ClientCertificateAuthorityPath { get; init; } = "certificates/generated/ca-cert.pem";
    public string ClientCertificateCommonName { get; init; } = "k6-client";
}

public sealed class HttpsOptions
{
    public const string SectionName = "Https";

    public int Port { get; init; } = 8443;
    public string ServerCertificatePath { get; init; } = "certificates/generated/server-cert.pem";
    public string ServerCertificateKeyPath { get; init; } = "certificates/generated/server-key.pem";
}

