using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Xunit;

namespace AuthApi.IntegrationTests;

public sealed class ApiIntegrationTests
{
    private static readonly Uri BaseUri = new(
        Environment.GetEnvironmentVariable("BASE_URL") ?? "https://localhost:8443");
    private static readonly string Username =
        Environment.GetEnvironmentVariable("AUTH_USERNAME") ?? "load-user";
    private static readonly string Password =
        Environment.GetEnvironmentVariable("AUTH_PASSWORD") ?? "change-me-now";
    private static readonly string ProjectRoot =
        Environment.GetEnvironmentVariable("PROJECT_ROOT") ?? FindProjectRoot();
    private static readonly string CertificateDirectory =
        Path.Combine(ProjectRoot, "certificates", "generated");

    [Fact]
    public async Task Health_endpoint_returns_ok()
    {
        using var client = CreateClient();
        using var response = await client.GetAsync("/health", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Scalar_interface_is_available()
    {
        using var client = CreateClient();
        using var response = await client.GetAsync("/scalar/", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task OpenApi_document_is_available()
    {
        using var client = CreateClient();
        using var response = await client.GetAsync(
            "/openapi/v1.json",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(
            await response.Content.ReadAsStreamAsync(TestContext.Current.CancellationToken));
        Assert.Equal("3.1.1", document.RootElement.GetProperty("openapi").GetString());
    }

    [Fact]
    public async Task Open_get_returns_ok()
    {
        using var client = CreateClient();
        using var response = await client.GetAsync(
            "/api/open/data",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Open_post_creates_data()
    {
        using var client = CreateClient();
        using var response = await client.PostAsJsonAsync(
            "/api/open/data",
            new DataWriteRequest("integration-open"),
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Jwt_endpoint_rejects_anonymous_request()
    {
        using var client = CreateClient();
        using var response = await client.GetAsync(
            "/api/jwt/data",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Jwt_get_returns_ok_with_token()
    {
        using var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Login(client));
        using var response = await client.GetAsync(
            "/api/jwt/data",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Jwt_post_creates_data_with_token()
    {
        using var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Login(client));
        using var response = await client.PostAsJsonAsync(
            "/api/jwt/data",
            new DataWriteRequest("integration-jwt"),
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Basic_endpoint_rejects_anonymous_request()
    {
        using var client = CreateClient();
        using var response = await client.GetAsync(
            "/api/basic/data",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Basic_get_returns_ok_with_credentials()
    {
        using var client = CreateClient();
        AddBasicAuthorization(client);
        using var response = await client.GetAsync(
            "/api/basic/data",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Basic_post_creates_data_with_credentials()
    {
        using var client = CreateClient();
        AddBasicAuthorization(client);
        using var response = await client.PostAsJsonAsync(
            "/api/basic/data",
            new DataWriteRequest("integration-basic"),
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Certificate_endpoint_rejects_request_without_certificate()
    {
        using var client = CreateClient();
        using var response = await client.GetAsync(
            "/api/certificate/data",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Certificate_get_returns_ok_with_client_certificate()
    {
        using var client = CreateClient(includeClientCertificate: true);
        using var response = await client.GetAsync(
            "/api/certificate/data",
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Certificate_post_creates_data_with_client_certificate()
    {
        using var client = CreateClient(includeClientCertificate: true);
        using var response = await client.PostAsJsonAsync(
            "/api/certificate/data",
            new DataWriteRequest("integration-certificate"),
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static HttpClient CreateClient(bool includeClientCertificate = false)
    {
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = ValidateServerCertificate
        };

        if (includeClientCertificate)
        {
            var certificate = X509Certificate2.CreateFromPemFile(
                Path.Combine(CertificateDirectory, "client-cert.pem"),
                Path.Combine(CertificateDirectory, "client-key.pem"));
            handler.ClientCertificates.Add(certificate);
        }

        return new HttpClient(handler) { BaseAddress = BaseUri };
    }

    private static bool ValidateServerCertificate(
        HttpRequestMessage request,
        X509Certificate2? certificate,
        X509Chain? suppliedChain,
        SslPolicyErrors errors)
    {
        _ = request;
        _ = suppliedChain;
        if (certificate is null || errors.HasFlag(SslPolicyErrors.RemoteCertificateNameMismatch))
        {
            return false;
        }

        using var authority = X509CertificateLoader.LoadCertificateFromFile(
            Path.Combine(CertificateDirectory, "ca-cert.pem"));
        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(authority);
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
        chain.ChainPolicy.DisableCertificateDownloads = true;
        chain.ChainPolicy.VerificationFlags = X509VerificationFlags.NoFlag;
        chain.ChainPolicy.ApplicationPolicy.Add(new Oid("1.3.6.1.5.5.7.3.1"));
        return chain.Build(certificate);
    }

    private static async Task<string> Login(HttpClient client)
    {
        using var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new LoginRequest(Username, Password),
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var token = await response.Content.ReadFromJsonAsync<TokenResponse>(
            TestContext.Current.CancellationToken);
        Assert.NotNull(token);
        Assert.False(string.IsNullOrWhiteSpace(token.AccessToken));
        return token.AccessToken;
    }

    private static void AddBasicAuthorization(HttpClient client)
    {
        var value = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Username}:{Password}"));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", value);
    }

    private static string FindProjectRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory);
             directory is not null;
             directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "AuthLoadDemo.slnx")))
            {
                return directory.FullName;
            }
        }

        throw new DirectoryNotFoundException(
            "Could not locate AuthLoadDemo.slnx. Set PROJECT_ROOT to the repository directory.");
    }

    private sealed record LoginRequest(string Username, string Password);
    private sealed record TokenResponse(string AccessToken);
    private sealed record DataWriteRequest(string Value);
}
