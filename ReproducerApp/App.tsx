import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Button,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import {
  HubConnection,
  HubConnectionBuilder,
  HttpTransportType,
} from '@microsoft/signalr';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {DEFAULT_BASE_URL, buildHubUrl, buildStatusUrl} from './signalRConfig';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const connectionRef = useRef<HubConnection | null>(null);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [httpReport, setHttpReport] = useState('Tap "Prime cookies" first.');
  const [signalRReport, setSignalRReport] = useState('Not connected yet.');
  const [connectionState, setConnectionState] = useState('Disconnected');

  const statusUrl = useMemo(() => buildStatusUrl(baseUrl), [baseUrl]);
  const hubUrl = useMemo(() => buildHubUrl(baseUrl), [baseUrl]);

  useEffect(() => {
    return () => {
      connectionRef.current?.stop().catch(() => undefined);
    };
  }, []);

  async function primeCookies() {
    try {
      const response = await fetch(statusUrl, {
        credentials: 'include',
      });
      const payloadText = await response.text();

      if (!response.ok) {
        setHttpReport(`HTTP ${response.status}: ${payloadText || response.statusText}`);
        return;
      }

      const payload = payloadText ? JSON.parse(payloadText) : {};

      setHttpReport(JSON.stringify(payload, null, 2));
    } catch (error) {
      setHttpReport(formatError(error));
    }
  }

  async function connectSignalR() {
    const existingConnection = connectionRef.current;

    if (existingConnection) {
      await existingConnection.stop();
    }

    setConnectionState('Connecting');
    setSignalRReport('Connecting...');

    const connection = new HubConnectionBuilder()
      .withUrl(hubUrl, {
        transport: HttpTransportType.WebSockets,
        withCredentials: true,
      })
      .build();

    connection.on('ConnectionReportUpdated', report => {
      setSignalRReport(JSON.stringify(report, null, 2));
    });

    connection.onclose(error => {
      setConnectionState(error ? `Disconnected: ${error.message}` : 'Disconnected');
    });

    connectionRef.current = connection;

    try {
      await connection.start();
      setConnectionState('Connected');

      const report = await connection.invoke('GetConnectionReport');
      setSignalRReport(JSON.stringify(report, null, 2));
    } catch (error) {
      setConnectionState('Failed');
      setSignalRReport(formatError(error));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>SignalR cookie path reproducer</Text>
      <Text style={styles.instructions}>
        Use a base URL that already includes the API path, for example
        {'\n'}
        {DEFAULT_BASE_URL}
      </Text>
      <Text style={styles.instructions}>
        This app first primes cookies over HTTP, then connects to SignalR over
        WebSockets and shows which cookies the server received.
      </Text>
      <Text style={styles.instructions}>
        Expected URLs:
        {'\n'}- HTTP status: {statusUrl}
        {'\n'}- SignalR hub: {hubUrl}
        {'\n'}- SignalR negotiate: {hubUrl}/negotiate
      </Text>

      <Text style={styles.label}>Base URL</Text>
      <TextInput
        accessibilityLabel="SignalR base URL"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setBaseUrl}
        style={styles.input}
        value={baseUrl}
      />

      <View style={styles.actions}>
        <Button onPress={primeCookies} title="Prime cookies" />
        <View style={styles.spacer} />
        <Button onPress={connectSignalR} title="Connect SignalR" />
      </View>

      <Text style={styles.sectionTitle}>Computed URLs</Text>
      <Text selectable style={styles.code}>
        {statusUrl}
      </Text>
      <Text selectable style={styles.code}>
        {hubUrl}
      </Text>

      <Text style={styles.sectionTitle}>Connection state</Text>
      <Text style={styles.body}>{connectionState}</Text>

      <Text style={styles.sectionTitle}>HTTP cookie priming report</Text>
      <Text selectable style={styles.code}>
        {httpReport}
      </Text>

      <Text style={styles.sectionTitle}>SignalR report</Text>
      <Text selectable style={styles.code}>
        {signalRReport}
      </Text>
    </ScrollView>
  );
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  body: {
    marginBottom: 16,
  },
  code: {
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
    fontFamily: 'monospace',
    marginBottom: 16,
    padding: 12,
  },
  content: {
    padding: 24,
  },
  input: {
    borderColor: '#999999',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 12,
  },
  instructions: {
    marginBottom: 12,
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  spacer: {
    width: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
});

export default App;
