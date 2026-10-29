using AuthApi.Models;
using AuthApi.Security;
using AuthApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthApi.Controllers;

[ApiController]
[Route("api")]
public sealed class DataController(DataStore store) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("open/data")]
    [ProducesResponseType<IReadOnlyCollection<DataRecord>>(StatusCodes.Status200OK)]
    public IActionResult GetOpenData() => Ok(store.GetAll());

    [AllowAnonymous]
    [HttpPost("open/data")]
    [ProducesResponseType<DataRecord>(StatusCodes.Status201Created)]
    [ProducesResponseType<ApiError>(StatusCodes.Status400BadRequest)]
    public IActionResult PostOpenData(DataWriteRequest request) =>
        AddRecord(request, "/api/open/data");

    [Authorize(AuthenticationSchemes = AuthSchemes.Jwt)]
    [HttpGet("jwt/data")]
    [ProducesResponseType<IReadOnlyCollection<DataRecord>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult GetJwtData() => Ok(store.GetAll());

    [Authorize(AuthenticationSchemes = AuthSchemes.Jwt)]
    [HttpPost("jwt/data")]
    [ProducesResponseType<DataRecord>(StatusCodes.Status201Created)]
    [ProducesResponseType<ApiError>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult PostJwtData(DataWriteRequest request) =>
        AddRecord(request, "/api/jwt/data");

    [Authorize(AuthenticationSchemes = AuthSchemes.Certificate)]
    [HttpGet("certificate/data")]
    [ProducesResponseType<IReadOnlyCollection<DataRecord>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult GetCertificateData() => Ok(store.GetAll());

    [Authorize(AuthenticationSchemes = AuthSchemes.Certificate)]
    [HttpPost("certificate/data")]
    [ProducesResponseType<DataRecord>(StatusCodes.Status201Created)]
    [ProducesResponseType<ApiError>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult PostCertificateData(DataWriteRequest request) =>
        AddRecord(request, "/api/certificate/data");

    [Authorize(AuthenticationSchemes = AuthSchemes.Basic)]
    [HttpGet("basic/data")]
    [ProducesResponseType<IReadOnlyCollection<DataRecord>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult GetBasicData() => Ok(store.GetAll());

    [Authorize(AuthenticationSchemes = AuthSchemes.Basic)]
    [HttpPost("basic/data")]
    [ProducesResponseType<DataRecord>(StatusCodes.Status201Created)]
    [ProducesResponseType<ApiError>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult PostBasicData(DataWriteRequest request) =>
        AddRecord(request, "/api/basic/data");

    private IActionResult AddRecord(DataWriteRequest request, string collectionPath)
    {
        if (string.IsNullOrWhiteSpace(request.Value) || request.Value.Length > 500)
        {
            return BadRequest(new ApiError("Value must contain between 1 and 500 characters."));
        }

        var submittedBy = User.Identity?.Name ?? "anonymous";
        var record = store.Add(request.Value, submittedBy);
        return Created($"{collectionPath}/{record.Id}", record);
    }
}
