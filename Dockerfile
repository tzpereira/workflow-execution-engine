# syntax=docker/dockerfile:1

FROM node:24-alpine AS ui-build
WORKDIR /src
RUN corepack enable
COPY ui/package.json ui/pnpm-lock.yaml ./ui/
RUN pnpm --dir ui install --frozen-lockfile
COPY ui ./ui
COPY schemas ./schemas
RUN pnpm --dir ui build

FROM golang:1.23-alpine AS cli-build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/wee ./cli

FROM alpine:3.22
RUN addgroup -S wee && adduser -S -G wee wee
WORKDIR /workflows
COPY --from=cli-build /out/wee /usr/local/bin/wee
COPY --from=ui-build /src/ui/dist /app/ui
COPY examples/templates /templates
RUN mkdir -p /data/.workflow /workflows && chown -R wee:wee /data /workflows
USER wee
EXPOSE 7676
VOLUME ["/data/.workflow", "/workflows"]
ENTRYPOINT ["wee"]
CMD ["serve", "--addr", "0.0.0.0:7676", "--workspace", "/data/.workflow", "--dir", "/workflows", "--templates", "/templates", "--ui-dir", "/app/ui"]
