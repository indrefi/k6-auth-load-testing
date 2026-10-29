using System.Security.Cryptography;
using System.Text;
using AuthApi.Configuration;
using Microsoft.Extensions.Options;

namespace AuthApi.Security;

public sealed class CredentialValidator(IOptions<AuthOptions> options)
{
    private readonly AuthOptions _options = options.Value;

    public bool Validate(string username, string password) =>
        FixedTimeEquals(username, _options.Username) && FixedTimeEquals(password, _options.Password);

    private static bool FixedTimeEquals(string supplied, string expected)
    {
        var suppliedHash = SHA256.HashData(Encoding.UTF8.GetBytes(supplied));
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        return CryptographicOperations.FixedTimeEquals(suppliedHash, expectedHash);
    }
}

