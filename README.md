# SignalR cookie path reproducer

This repository contains:

- `SignalRServer/`: a minimal Node server that exposes its API under `/my/path`
- `ReproducerApp/`: a React Native app that talks to that server through SignalR

The server sets two cookies on every HTTP response:

- `rootCookie=...; Path=/`
- `scopedCookie=...` without a `Path` attribute, so it inherits the `/my/path` scope

Important:

- the React Native app base URL must include the path: `http://host:3000/my/path`
- the status endpoint is `http://host:3000/my/path/status`
- the SignalR negotiate endpoint is `http://host:3000/my/path/hub/negotiate`
- the SignalR WebSocket endpoint is `ws://host:3000/my/path/hub`
- the Node server in this repo is SignalR-compatible for this repro; Node does not have an official Microsoft SignalR server package like ASP.NET Core does

## Run the Node server

```sh
cd SignalRServer
npm install
npm start
```

The default server URL is:

```txt
http://localhost:3000/my/path
```

## Run the React Native app

Use the default base URL in the app and replace the host as needed for your device or emulator. For Android emulator, the app defaults to:

```txt
http://10.0.2.2:3000/my/path
```

Then:

1. Tap **Prime cookies**
2. Tap **Connect SignalR**
3. Compare the HTTP report and the SignalR report to see which cookies the server received
