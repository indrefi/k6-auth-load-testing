using System.Security.Cryptography.X509Certificates;
using AuthApi.Configuration;
using AuthApi.Security;
using AuthApi.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Scalar.AspNetCore;

var builder = WebApplication.CreateSlimBuilder(args);

builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection(AuthOptions.SectionName));

var httpsOptions = builder.Configuration.GetSection(HttpsOptions.SectionName).Get<HttpsOptions>() ?? new HttpsOptions();
var serverCertificatePath = Path.GetFullPath(httpsOptions.ServerCertificatePath, builder.Environment.ContentRootPath);
var serverCertificateKeyPath = Path.GetFullPath(httpsOptions.ServerCertificateKeyPath, builder.Environment.ContentRootPath);
builder.WebHost.ConfigureKestrel(server =>
{
    server.ListenAnyIP(httpsOptions.Port, listen =>
    {
        listen.UseHttps(options =>
        {
            options.ServerCertificate = X509Certificate2.CreateFromPemFile(
                serverCertificatePath,
                serverCertificateKeyPath);
            options.ClientCertificateMode = ClientCertificateMode.AllowCertificate;
            options.AllowAnyClientCertificate();
        });
    });
});

builder.Services.AddSingleton<CredentialValidator>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<ClientCertificateValidator>();
builder.Services.AddSingleton<DataStore>();

builder.Services.AddAuthentication()
    .AddScheme<AuthenticationSchemeOptions, JwtAuthenticationHandler>(AuthSchemes.Jwt, _ => { })
    .AddScheme<AuthenticationSchemeOptions, BasicAuthenticationHandler>(AuthSchemes.Basic, _ => { })
    .AddScheme<AuthenticationSchemeOptions, CertificateAuthenticationHandler>(AuthSchemes.Certificate, _ => { });
builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddOpenApi("v1", options =>
{
    options.AddDocumentTransformer<OpenApiSecurityDocumentTransformer>();
    options.AddOperationTransformer<OpenApiSecurityOperationTransformer>();
});

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapOpenApi();
app.MapScalarApiReference(options =>
{
    options.WithTitle("AuthLoadDemo API");
    options.DisableAgent();
});

app.Run();
