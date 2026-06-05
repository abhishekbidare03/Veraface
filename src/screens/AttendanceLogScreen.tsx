/**
 * AttendanceLogScreen.tsx  (v2)
 * Scrollable attendance log with filter tabs and sync status.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import db from '../services/DatabaseService';
import { SyncService } from '../services/SyncService';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  id:          string;
  person_id:   string;
  person_name: string;
  emp_id:      string;
  timestamp:   number;
  confidence:  number;
  liveness_ok: number;
  lat:         number | null;
  lon:         number | null;
  synced:      number;
}

type FilterTab = 'all' | 'pending' | 'synced';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtTime = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const syncBadge = (synced: number) => ({
  label: synced ? 'SYNCED' : 'PENDING',
  color: synced ? '#4CAF50' : '#FF9800',
});

// ─── Log Row ──────────────────────────────────────────────────────────────────

const LogRow = ({ item }: { item: LogEntry }) => {
  const badge = syncBadge(item.synced);
  const pct = (item.confidence * 100).toFixed(1);
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowName}>{item.person_name || 'Unknown'}</Text>
        <Text style={styles.rowEmpId}>{item.emp_id}</Text>
        <Text style={styles.rowTime}>{fmtTime(item.timestamp)}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>🎯 {pct}%</Text>
          {item.liveness_ok ? (
            <Text style={styles.metaLive}>✅ Live</Text>
          ) : (
            <Text style={styles.metaSpoof}>⚠️ Liveness failed</Text>
          )}
          {item.lat != null && (
            <Text style={styles.metaText}>📍 {item.lat.toFixed(4)}, {item.lon?.toFixed(4)}</Text>
          )}
        </View>
      </View>
      <View style={[styles.badge, { borderColor: badge.color }]}>
        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
      </View>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AttendanceLogScreen() {
  const [entries,    setEntries]   = useState<LogEntry[]>([]);
  const [tab,        setTab]       = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [syncing,    setSyncing]   = useState(false);
  const [pendingCnt, setPendingCnt] = useState(0);
  const [syncMsg,    setSyncMsg]   = useState('');

  const loadData = useCallback(async () => {
    const rows = await db.getAllAttendance(500) as LogEntry[];
    setEntries(rows);
    const cnt = rows.filter(r => r.synced === 0).length;
    setPendingCnt(cnt);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const filteredEntries = entries.filter(e => {
    if (tab === 'pending') return e.synced === 0;
    if (tab === 'synced')  return e.synced === 1;
    return true;
  });

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    const r = await SyncService.syncAttendance();
    setSyncing(false);
    setSyncMsg(r.error
      ? `Error: ${r.error}`
      : `Synced ${r.synced} records, purged ${r.purged}`);
    await loadData();
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyText}>
        {tab === 'pending' ? 'No pending records' :
         tab === 'synced'  ? 'No synced records yet' :
         'No attendance records yet'}
      </Text>
      {tab === 'all' && (
        <Text style={styles.emptyHint}>Scan a registered face to log attendance</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>📋 Attendance Log</Text>
        <Text style={styles.count}>{filteredEntries.length} records</Text>
      </View>

      {/* Sync bar */}
      {pendingCnt > 0 && (
        <View style={styles.syncBar}>
          <Text style={styles.syncBarText}>{pendingCnt} records pending sync</Text>
          <TouchableOpacity
            style={[styles.syncBarBtn, syncing && { opacity: 0.6 }]}
            onPress={handleSync}
            disabled={syncing}>
            <Text style={styles.syncBarBtnText}>{syncing ? 'Syncing...' : 'Sync Now'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {syncMsg !== '' && (
        <Text style={styles.syncMsg}>{syncMsg}</Text>
      )}

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {(['all', 'pending', 'synced'] as FilterTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all'     ? `All (${entries.length})` :
               t === 'pending' ? `Pending (${entries.filter(e => !e.synced).length})` :
               `Synced (${entries.filter(e => e.synced).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filteredEntries}
        keyExtractor={i => i.id}
        renderItem={({ item }) => <LogRow item={item} />}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }}
            tintColor="#00E5FF"
          />
        }
        contentContainerStyle={{ paddingBottom: 80, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117' },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 10 },
  title:     { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 20 },
  count:     { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 13 },

  syncBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E65100',
    paddingHorizontal: 16, paddingVertical: 10,
    justifyContent: 'space-between',
  },
  syncBarText: { color: '#FFFFFF', fontFamily: 'Roboto-Regular', fontSize: 13 },
  syncBarBtn:  { backgroundColor: '#BF360C', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  syncBarBtnText: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 13 },
  syncMsg:     { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 12, paddingHorizontal: 20, paddingBottom: 6 },

  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: 'center', backgroundColor: '#161B22',
  },
  tabActive:     { backgroundColor: '#006064' },
  tabText:       { color: '#607D8B', fontFamily: 'Roboto-Medium', fontSize: 12 },
  tabTextActive: { color: '#00E5FF' },

  row: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14,
    alignItems: 'flex-start', gap: 12,
  },
  rowLeft:   { flex: 1, gap: 3 },
  rowName:   { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 15 },
  rowEmpId:  { color: '#607D8B', fontFamily: 'Roboto-Medium', fontSize: 11, letterSpacing: 1 },
  rowTime:   { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 12 },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  metaText:  { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 11 },
  metaLive:  { color: '#4CAF50', fontFamily: 'Roboto-Regular', fontSize: 11 },
  metaSpoof: { color: '#F44336', fontFamily: 'Roboto-Regular', fontSize: 11 },

  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontFamily: 'Roboto-Bold', fontSize: 10, letterSpacing: 0.8 },

  sep:   { height: 1, backgroundColor: '#161B22', marginHorizontal: 16 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#607D8B', fontFamily: 'Roboto-Bold', fontSize: 17 },
  emptyHint: { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
});
