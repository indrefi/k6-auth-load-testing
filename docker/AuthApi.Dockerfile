FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY src/AuthApi/AuthApi.csproj src/AuthApi/
RUN dotnet restore src/AuthApi/AuthApi.csproj
COPY src/AuthApi/ src/AuthApi/
RUN dotnet publish src/AuthApi/AuthApi.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8443
ENTRYPOINT ["dotnet", "AuthApi.dll"]
