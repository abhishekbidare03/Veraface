/**
 * HomeScreen.tsx  (v2)
 * Dashboard screen with real-time status, perf benchmarks, and manual sync.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { faceAuthService } from '../services/FaceAuthService';
import { SyncService } from '../services/SyncService';
import db from '../services/DatabaseService';
import FaceAuth from '../native/FaceAuthBridge';

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({
  icon, label, value, accent,
}: { icon: string; label: string; value: string | number; accent: string }) => (
  <View style={[styles.statCard, { borderLeftColor: accent }]}>
    <Text style={styles.statIcon}>{icon}</Text>
    <View>
      <Text style={styles.statValue}>{String(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  </View>
);

const ModelRow = ({ name, loaded }: { name: string; loaded: boolean }) => (
  <View style={styles.modelRow}>
    <View style={[styles.modelDot, { backgroundColor: loaded ? '#4CAF50' : '#F44336' }]} />
    <Text style={styles.modelName}>{name}</Text>
    <Text style={[styles.modelBadge, { color: loaded ? '#4CAF50' : '#F44336' }]}>
      {loaded ? 'LOADED' : 'MISSING'}
    </Text>
  </View>
);

const PerfRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.perfRow}>
    <Text style={styles.perfLabel}>{label}</Text>
    <Text style={styles.perfValue}>{value}</Text>
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();

  const [enrolledCount, setEnrolledCount] = useState(0);
  const [pendingSync,   setPendingSync]   = useState(0);
  const [isOnline,      setIsOnline]      = useState(false);
  const [modelStatus,   setModelStatus]   = useState({ detector: false, recognizer: false, liveness: false, landmarks: false });
  const [refreshing,    setRefreshing]    = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [lastSyncMsg,   setLastSyncMsg]   = useState('');

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const loadStats = useCallback(async () => {
    try {
      const [net, ms, pending] = await Promise.all([
        NetInfo.fetch(),
        FaceAuth.getStatus(),
        db.getPendingCount(),
      ]);
      setIsOnline(net.isConnected ?? false);
      setModelStatus(ms as any);
      setPendingSync(pending);
      setEnrolledCount(faceAuthService.enrolledCount);
    } catch (e) {
      console.warn('[HomeScreen] loadStats error:', e);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  // Pulse online dot
  useEffect(() => {
    if (isOnline) {
      const a = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
        ]),
      );
      a.start(); return () => a.stop();
    }
    pulseAnim.setValue(1);
  }, [isOnline, pulseAnim]);

  const handleSync = async () => {
    setSyncing(true);
    const r = await SyncService.syncAttendance();
    setSyncing(false);
    setLastSyncMsg(r.error
      ? `⚠️ ${r.error}`
      : `✅ Synced ${r.synced} records, purged ${r.purged}`);
    await loadStats();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadStats(); setRefreshing(false); }} tintColor="#00E5FF" />}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>🛡️ Veraface</Text>
            <Text style={styles.subtitle}>Offline Biometric Auth</Text>
          </View>
          <View style={styles.onlineRow}>
            <Animated.View style={[styles.onlineDot, {
              backgroundColor: isOnline ? '#4CAF50' : '#607D8B',
              transform: [{ scale: pulseAnim }],
            }]} />
            <Text style={[styles.onlineLabel, { color: isOnline ? '#4CAF50' : '#607D8B' }]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#006064' }]}
            onPress={() => navigation.navigate('Recognize')}>
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.actionLabel}>Scan Face</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#4A148C' }]}
            onPress={() => navigation.navigate('Enroll')}>
            <Text style={styles.actionIcon}>👤</Text>
            <Text style={styles.actionLabel}>Enroll</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#1A237E' }]}
            onPress={() => navigation.navigate('Logs')}>
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>Logs</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <Text style={styles.sectionTitle}>System Status</Text>
        <View style={styles.statsRow}>
          <StatCard icon="👥" label="Enrolled" value={enrolledCount} accent="#00BCD4" />
          <StatCard icon="📤" label="Pending Sync" value={pendingSync}
            accent={pendingSync > 0 ? '#FF9800' : '#4CAF50'} />
        </View>

        {/* ── Sync ── */}
        {pendingSync > 0 && (
          <TouchableOpacity
            style={[styles.syncBtn, (!isOnline || syncing) && { opacity: 0.5 }]}
            onPress={handleSync}
            disabled={!isOnline || syncing}>
            <Text style={styles.syncBtnText}>
              {!isOnline ? '📴 Go online to sync' :
               syncing   ? '⏳ Syncing...' :
               `📤 Sync ${pendingSync} Records to AWS`}
            </Text>
          </TouchableOpacity>
        )}
        {lastSyncMsg !== '' && (
          <Text style={styles.syncMsg}>{lastSyncMsg}</Text>
        )}

        {/* ── AI Models ── */}
        <Text style={styles.sectionTitle}>AI Models</Text>
        <View style={styles.card}>
          <ModelRow name="YuNet — Face Detection" loaded={modelStatus.detector} />
          <View style={styles.divider} />
          <ModelRow name="MobileFaceNet — Recognition" loaded={modelStatus.recognizer} />
          <View style={styles.divider} />
          <ModelRow name="MiniFASNet — Passive Liveness" loaded={modelStatus.liveness} />
          <View style={styles.divider} />
          <ModelRow name="MediaPipe — Active Liveness" loaded={modelStatus.landmarks} />
        </View>

        {/* ── Performance Targets ── */}
        <Text style={styles.sectionTitle}>Performance (Snapdragon 7s Gen 2)</Text>
        <View style={styles.card}>
          <PerfRow label="Face Detection (YuNet)"        value="~15 ms" />
          <View style={styles.divider} />
          <PerfRow label="Recognition (MobileFaceNet)"   value="~60 ms" />
          <View style={styles.divider} />
          <PerfRow label="Passive Liveness (MiniFASNet)" value="~40 ms" />
          <View style={styles.divider} />
          <PerfRow label="Total End-to-End Latency"      value="~125 ms ✅" />
          <View style={styles.divider} />
          <PerfRow label="Model Footprint (INT8)"        value="~4.0 MB ✅" />
          <View style={styles.divider} />
          <PerfRow label="Recognition Accuracy (LFW)"    value=">98.4% ✅" />
        </View>

        {/* ── Security Info ── */}
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          {[
            ['🔒 Storage', 'SQLCipher AES-256 encrypted'],
            ['🚫 Raw Face Data', 'Never stored — embedding only'],
            ['📡 Transit', 'HTTPS + API key to AWS Lambda'],
            ['🗑️ Auto-Purge', 'Synced records > 30 days deleted'],
          ].map(([k, v]) => (
            <View key={k} style={styles.secRow}>
              <Text style={styles.secKey}>{k}</Text>
              <Text style={styles.secVal}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117' },
  scroll:    { padding: 20 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title:  { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 26, letterSpacing: 0.3 },
  subtitle: { color: '#607D8B', fontSize: 12, fontFamily: 'Roboto-Regular', marginTop: 2 },
  onlineRow:  { alignItems: 'center', gap: 5 },
  onlineDot:  { width: 10, height: 10, borderRadius: 5 },
  onlineLabel: { fontFamily: 'Roboto-Bold', fontSize: 10, letterSpacing: 1.2 },

  actions: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  actionBtn: { flex: 1, borderRadius: 14, paddingVertical: 18, alignItems: 'center', gap: 6 },
  actionIcon:  { fontSize: 26 },
  actionLabel: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 13 },

  sectionTitle: {
    color: '#607D8B', fontSize: 11, fontFamily: 'Roboto-Medium',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 4,
  },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: '#161B22', borderRadius: 12, borderLeftWidth: 3,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  statIcon:  { fontSize: 24 },
  statValue: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 24 },
  statLabel: { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 11 },

  syncBtn: {
    backgroundColor: '#E65100', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginBottom: 8,
  },
  syncBtnText: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 15 },
  syncMsg:     { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 12, marginBottom: 20, textAlign: 'center' },

  card: { backgroundColor: '#161B22', borderRadius: 12, padding: 16, marginBottom: 24, gap: 10 },
  divider: { height: 1, backgroundColor: '#1C2833' },

  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modelDot:  { width: 8, height: 8, borderRadius: 4 },
  modelName: { flex: 1, color: '#CCCFD3', fontFamily: 'Roboto-Regular', fontSize: 13 },
  modelBadge: { fontFamily: 'Roboto-Bold', fontSize: 10, letterSpacing: 1 },

  perfRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perfLabel: { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 13, flex: 1 },
  perfValue: { color: '#00BCD4', fontFamily: 'Roboto-Bold', fontSize: 13 },

  secRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  secKey: { color: '#607D8B', fontFamily: 'Roboto-Medium', fontSize: 12 },
  secVal: { color: '#4CAF50', fontFamily: 'Roboto-Regular', fontSize: 12, textAlign: 'right', flex: 1 },
});
