/**
 * App.tsx
 * Root application component for Veraface.
 * Initializes the database, face auth service, and sync listener on startup.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import db from './src/services/DatabaseService';
import { faceAuthService } from './src/services/FaceAuthService';
import { SyncService } from './src/services/SyncService';

type AppStatus = 'booting' | 'ready' | 'error';

export default function App() {
  const [status, setStatus] = useState<AppStatus>('booting');
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // 1. Initialize encrypted SQLite database
        await db.initialize();
        console.log('[App] ✅ Database initialized');

        // 2. Load AI models and enrolled persons into memory
        await faceAuthService.initialize();
        console.log('[App] ✅ FaceAuth service initialized');

        // 3. Start background network sync listener
        SyncService.startSyncListener();
        console.log('[App] ✅ Sync listener started');

        setStatus('ready');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[App] Boot failed:', msg);
        setBootError(msg);
        setStatus('error');
      }
    })();

    return () => {
      SyncService.stopSyncListener();
      db.close();
    };
  }, []);

  if (status === 'booting') {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootLogo}>🛡️</Text>
        <Text style={styles.bootTitle}>Veraface</Text>
        <Text style={styles.bootSub}>Initializing secure biometric engine...</Text>
        <ActivityIndicator color="#00E5FF" size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootLogo}>❌</Text>
        <Text style={[styles.bootTitle, { color: '#F44336' }]}>Boot Error</Text>
        <Text style={styles.bootSub}>{bootError}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  bootLogo: { fontSize: 72, marginBottom: 8 },
  bootTitle: {
    color: '#FFFFFF',
    fontFamily: 'Roboto-Bold',
    fontSize: 32,
    letterSpacing: 1,
  },
  bootSub: {
    color: '#607D8B',
    fontFamily: 'Roboto-Regular',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
