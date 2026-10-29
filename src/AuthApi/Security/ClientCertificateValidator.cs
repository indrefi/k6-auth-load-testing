using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using AuthApi.Configuration;
using Microsoft.Extensions.Options;

namespace AuthApi.Security;

public sealed class ClientCertificateValidator
{
    private static readonly Oid ClientAuthenticationOid = new("1.3.6.1.5.5.7.3.2");
    private readonly ConcurrentDictionary<string, DateTimeOffset> _validCertificates = new();
    private readonly X509Certificate2 _authority;
    private readonly AuthOptions _options;

    public ClientCertificateValidator(
        IOptions<AuthOptions> options,
        IWebHostEnvironment environment)
    {
        _options = options.Value;
        var authorityPath = Path.GetFullPath(
            _options.ClientCertificateAuthorityPath,
            environment.ContentRootPath);
        _authority = X509CertificateLoader.LoadCertificateFromFile(authorityPath);
    }

    public bool Validate(X509Certificate2 certificate, out string identity)
    {
        identity = certificate.GetNameInfo(X509NameType.SimpleName, false);
        var now = DateTimeOffset.UtcNow;
        if (identity != _options.ClientCertificateCommonName ||
            now < certificate.NotBefore || now > certificate.NotAfter)
        {
            return false;
        }

        if (_validCertificates.TryGetValue(certificate.Thumbprint, out var cachedUntil) && cachedUntil > now)
        {
            return true;
        }

        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(_authority);
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
        chain.ChainPolicy.DisableCertificateDownloads = true;
        chain.ChainPolicy.VerificationFlags = X509VerificationFlags.NoFlag;
        chain.ChainPolicy.ApplicationPolicy.Add(ClientAuthenticationOid);
        if (!chain.Build(certificate))
        {
            return false;
        }

        var cacheExpiry = now.AddMinutes(2);
        if (cacheExpiry > certificate.NotAfter)
        {
            cacheExpiry = certificate.NotAfter;
        }

        _validCertificates[certificate.Thumbprint] = cacheExpiry;
        return true;
    }
}

