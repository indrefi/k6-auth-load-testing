using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AuthApi.Configuration;
using AuthApi.Models;
using Microsoft.Extensions.Options;

namespace AuthApi.Security;

public sealed class JwtTokenService(IOptions<AuthOptions> options)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AuthOptions _options = options.Value;

    public TokenResponse Create(string username)
    {
        var now = DateTimeOffset.UtcNow;
        var expires = now.AddMinutes(_options.JwtLifetimeMinutes);
        var header = new Dictionary<string, object> { ["alg"] = "HS256", ["typ"] = "JWT" };
        var payload = new Dictionary<string, object>
        {
            ["sub"] = username,
            ["name"] = username,
            ["iss"] = _options.JwtIssuer,
            ["aud"] = _options.JwtAudience,
            ["iat"] = now.ToUnixTimeSeconds(),
            ["nbf"] = now.ToUnixTimeSeconds(),
            ["exp"] = expires.ToUnixTimeSeconds(),
            ["jti"] = Guid.NewGuid().ToString("N")
        };

        var encodedHeader = Base64Url(JsonSerializer.SerializeToUtf8Bytes(header, JsonOptions));
        var encodedPayload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload, JsonOptions));
        var unsigned = $"{encodedHeader}.{encodedPayload}";
        var signature = Sign(unsigned);
        return new TokenResponse($"{unsigned}.{signature}", "Bearer", (int)(expires - now).TotalSeconds);
    }

    public bool TryValidate(string token, out string username)
    {
        username = string.Empty;
        var parts = token.Split('.');
        if (parts.Length != 3)
        {
            return false;
        }

        var expectedSignature = Sign($"{parts[0]}.{parts[1]}");
        if (!FixedTimeBase64Equals(parts[2], expectedSignature))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(Base64UrlDecode(parts[1]));
            var root = document.RootElement;
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (root.GetProperty("exp").GetInt64() <= now ||
                root.GetProperty("nbf").GetInt64() > now + 30 ||
                root.GetProperty("iss").GetString() != _options.JwtIssuer ||
                root.GetProperty("aud").GetString() != _options.JwtAudience)
            {
                return false;
            }

            username = root.GetProperty("sub").GetString() ?? string.Empty;
            return username.Length > 0;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (FormatException)
        {
            return false;
        }
        catch (KeyNotFoundException)
        {
            return false;
        }
    }

    private string Sign(string unsignedToken)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_options.JwtSigningKey));
        return Base64Url(hmac.ComputeHash(Encoding.ASCII.GetBytes(unsignedToken)));
    }

    private static bool FixedTimeBase64Equals(string left, string right)
    {
        try
        {
            return CryptographicOperations.FixedTimeEquals(Base64UrlDecode(left), Base64UrlDecode(right));
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string Base64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - padded.Length % 4) % 4);
        return Convert.FromBase64String(padded);
    }
}

