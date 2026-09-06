/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

const mockConnection = {
  invoke: jest.fn().mockResolvedValue({connected: true}),
  on: jest.fn(),
  onclose: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
};

jest.mock('react-native-safe-area-context', () => {
  const {Fragment, jsx} = require('react/jsx-runtime');

  return {
    SafeAreaProvider: ({children}: {children: React.ReactNode}) =>
      jsx(Fragment, {children}),
  };
});

beforeEach(() => {
  global.fetch = jest.fn();
  mockConnection.invoke.mockReset().mockResolvedValue({connected: true});
  mockConnection.on.mockReset();
  mockConnection.onclose.mockReset();
  mockConnection.start.mockReset().mockResolvedValue(undefined);
  mockConnection.stop.mockReset().mockResolvedValue(undefined);
});

jest.mock('@microsoft/signalr', () => {
  const builder = {
    build: jest.fn(() => mockConnection),
    withUrl: jest.fn(() => builder),
  };

  return {
    HubConnectionBuilder: jest.fn(() => builder),
    HttpTransportType: {
      WebSockets: 'WebSockets',
    },
  };
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('connects and renders the signalr report', async () => {
  let app: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    app = ReactTestRenderer.create(<App />);
  });

  const connectButton = app.root.findByProps({title: 'Connect SignalR'});

  await ReactTestRenderer.act(async () => {
    await connectButton.props.onPress();
  });

  expect(mockConnection.start).toHaveBeenCalled();
  expect(mockConnection.invoke).toHaveBeenCalledWith('GetConnectionReport');
  expect(JSON.stringify(app.toJSON())).toContain('connected');
});

test('primes cookies and renders the HTTP report', async () => {
  let app: ReactTestRenderer.ReactTestRenderer;

  global.fetch.mockResolvedValueOnce({
    ok: true,
    text: jest.fn().mockResolvedValue('{"cookie":"ok"}'),
  });

  await ReactTestRenderer.act(() => {
    app = ReactTestRenderer.create(<App />);
  });

  const primeButton = app.root.findByProps({title: 'Prime cookies'});

  await ReactTestRenderer.act(async () => {
    await primeButton.props.onPress();
  });

  expect(global.fetch).toHaveBeenCalledWith(
    'http://10.0.2.2:3000/my/path/status',
    {credentials: 'include'},
  );
  expect(JSON.stringify(app.toJSON())).toContain('cookie');
  expect(JSON.stringify(app.toJSON())).toContain('ok');
});

test('shows an HTTP priming failure', async () => {
  let app: ReactTestRenderer.ReactTestRenderer;

  global.fetch.mockResolvedValueOnce({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: jest.fn().mockResolvedValue('nope'),
  });

  await ReactTestRenderer.act(() => {
    app = ReactTestRenderer.create(<App />);
  });

  const primeButton = app.root.findByProps({title: 'Prime cookies'});

  await ReactTestRenderer.act(async () => {
    await primeButton.props.onPress();
  });

  expect(JSON.stringify(app.toJSON())).toContain('HTTP 500: nope');
});

test('shows a failure state when the signalr connection fails', async () => {
  let app: ReactTestRenderer.ReactTestRenderer;

  mockConnection.start.mockRejectedValueOnce(new Error('boom'));

  await ReactTestRenderer.act(() => {
    app = ReactTestRenderer.create(<App />);
  });

  const connectButton = app.root.findByProps({title: 'Connect SignalR'});

  await ReactTestRenderer.act(async () => {
    await connectButton.props.onPress();
  });

  expect(mockConnection.stop).toHaveBeenCalled();
  expect(JSON.stringify(app.toJSON())).toContain('Failed');
  expect(JSON.stringify(app.toJSON())).toContain('boom');
});
