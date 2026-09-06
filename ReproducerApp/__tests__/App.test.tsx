/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@microsoft/signalr', () => {
  const connection = {
    invoke: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
    onclose: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  };

  const builder = {
    build: jest.fn(() => connection),
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
