FROM golang:1.21-alpine
WORKDIR /app
COPY go.mod ./
COPY *.go ./
RUN go build -o /wallet-service
EXPOSE 8082
CMD ["/wallet-service"]
