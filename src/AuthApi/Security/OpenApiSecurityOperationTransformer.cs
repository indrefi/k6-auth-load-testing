using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace AuthApi.Security;

public sealed class OpenApiSecurityOperationTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(
        OpenApiOperation operation,
        OpenApiOperationTransformerContext context,
        CancellationToken cancellationToken)
    {
        var authorize = context.Description.ActionDescriptor.EndpointMetadata
            .OfType<AuthorizeAttribute>()
            .LastOrDefault();

        if (authorize is null || string.IsNullOrWhiteSpace(authorize.AuthenticationSchemes))
        {
            return Task.CompletedTask;
        }

        operation.Security ??= [];
        foreach (var schemeName in authorize.AuthenticationSchemes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            operation.Security.Add(new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference(schemeName, context.Document)] = []
            });
        }

        return Task.CompletedTask;
    }
}
